import "server-only";

import type { PrismaClient, TreasuryWithdrawal } from "@prisma/client";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  TransactionReceiptNotFoundError,
  type Hex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { getPrisma } from "@/server/db";
import { findAsset, payoutAccount } from "@/server/treasury/config";
import { CASH_ASSET, custodyEnabled } from "@/server/treasury/funds";
import { rpcFor } from "@/server/treasury/liquidity";

/**
 * Automatic withdrawals from a hot payout wallet.
 *
 * Deposits still land in the watch-only treasury; this wallet holds a small float
 * the operator tops up. Its key is on the server, so everything it can do is capped:
 * per withdrawal, per rolling 24h, and by whatever float it holds. Anything outside
 * the caps stays PENDING for the operator queue exactly as before.
 *
 * Exactly-once: the transfer is signed with a fixed nonce and persisted (SENDING)
 * before it is broadcast. A crash can then only rebroadcast the same signed bytes,
 * which the chain accepts at most once. A partial unique index allows one SENDING
 * row at a time, so two workers can never sign competing nonces.
 */

type EnvRecord = Record<string, string | undefined>;

const DAY_MS = 86_400_000;
const DEFAULT_MAX_MICROS = 100_000_000n;
const DEFAULT_DAILY_MAX_MICROS = 500_000_000n;

export type PayoutChain = {
  chainId: number;
  token: Hex;
  tokenBalance(address: Hex): Promise<bigint>;
  nativeBalance(address: Hex): Promise<bigint>;
  nonce(address: Hex, tag: "pending" | "latest"): Promise<number>;
  estimateGas(from: Hex, data: Hex): Promise<bigint>;
  fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  broadcast(raw: Hex): Promise<void>;
  /** null when the chain has no receipt for the hash (yet). */
  receipt(hash: Hex): Promise<{ status: "success" | "reverted" } | null>;
};

export type PayoutResult = { sent: number; settled: number; manual: number; waiting: string | null };

function micros(env: EnvRecord, name: string, fallback: bigint) {
  const raw = (env[name] ?? "").trim();
  if (!/^\d+$/.test(raw)) return fallback;
  return BigInt(raw);
}

export function payoutLimits(env: EnvRecord = process.env) {
  return {
    maxMicros: micros(env, "VEYRA_PAYOUT_MAX_MICROS", DEFAULT_MAX_MICROS),
    dailyMaxMicros: micros(env, "VEYRA_PAYOUT_DAILY_MAX_MICROS", DEFAULT_DAILY_MAX_MICROS),
  };
}

/** The ledger counts in 6-decimal micros; the token may use other decimals. */
function toBaseUnits(amountMicros: bigint, decimals: number) {
  return decimals >= 6 ? amountMicros * 10n ** BigInt(decimals - 6) : amountMicros / 10n ** BigInt(6 - decimals);
}

export function viemPayoutChain(env: EnvRecord = process.env): { chain: PayoutChain; decimals: number } | null {
  const asset = findAsset(CASH_ASSET, env as NodeJS.ProcessEnv);
  if (!asset) return null;
  const rpc = rpcFor(asset.chainId, env);
  if (!rpc) return null;
  const client = createPublicClient({ transport: http(rpc) });
  const token = asset.contract as Hex;
  return {
    decimals: asset.decimals,
    chain: {
      chainId: asset.chainId,
      token,
      tokenBalance: (address) =>
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      nativeBalance: (address) => client.getBalance({ address }),
      nonce: (address, blockTag) => client.getTransactionCount({ address, blockTag }),
      estimateGas: (from, data) => client.estimateGas({ account: from, to: token, data }),
      fees: async () => {
        const fees = await client.estimateFeesPerGas();
        return { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
      },
      broadcast: async (raw) => {
        try {
          await client.sendRawTransaction({ serializedTransaction: raw });
        } catch (error) {
          // A rebroadcast of bytes the node already has, or that already mined, is expected.
          const message = error instanceof Error ? error.message.toLowerCase() : "";
          if (message.includes("already known") || message.includes("nonce too low")) return;
          throw error;
        }
      },
      receipt: async (hash) => {
        try {
          const receipt = await client.getTransactionReceipt({ hash });
          return { status: receipt.status };
        } catch (error) {
          if (error instanceof TransactionReceiptNotFoundError) return null;
          throw error;
        }
      },
    },
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

async function toManual(prisma: PrismaClient, id: string, from: string, errorMessage: string) {
  await prisma.treasuryWithdrawal.updateMany({
    where: { id, status: from },
    data: {
      status: "PENDING",
      manualOnly: true,
      errorMessage,
      txHash: null,
      payoutFrom: null,
      payoutNonce: null,
      payoutRawTx: null,
      sentAt: null,
    },
  });
}

async function settle(prisma: PrismaClient, chain: PayoutChain, row: TreasuryWithdrawal) {
  const hash = row.txHash as Hex;
  const done = async (status: "success" | "reverted") => {
    if (status === "success") {
      await prisma.treasuryWithdrawal.updateMany({
        where: { id: row.id, status: "SENDING" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } else {
      await toManual(prisma, row.id, "SENDING", `Automatic payout reverted on-chain (${hash}). Nothing was sent.`);
    }
    return true;
  };

  const receipt = await chain.receipt(hash);
  if (receipt) return done(receipt.status);

  const mined = await chain.nonce(row.payoutFrom as Hex, "latest");
  if (mined > (row.payoutNonce ?? 0)) {
    // The nonce is used. Re-check first: ours may have mined between the two reads.
    const late = await chain.receipt(hash);
    if (late) return done(late.status);
    await toManual(
      prisma,
      row.id,
      "SENDING",
      `Payout nonce ${row.payoutNonce} was used by a different transaction than ${hash}. Verify the destination on-chain before settling.`,
    );
    return true;
  }
  // Still unmined: push the same signed bytes again. Never re-sign.
  await chain.broadcast(row.payoutRawTx as Hex);
  return false;
}

async function send(
  prisma: PrismaClient,
  chain: PayoutChain,
  account: PrivateKeyAccount,
  row: TreasuryWithdrawal,
  decimals: number,
) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [row.destAddress as Hex, toBaseUnits(row.amountMicros, decimals)],
  });
  const [nonce, gas, fees] = await Promise.all([
    chain.nonce(account.address, "pending"),
    chain.estimateGas(account.address, data),
    chain.fees(),
  ]);
  const gasLimit = (gas * 12n) / 10n;
  if ((await chain.nativeBalance(account.address)) < gasLimit * fees.maxFeePerGas) {
    return "Payout wallet cannot pay gas. Top it up with native gas.";
  }
  const raw = await account.signTransaction({
    type: "eip1559",
    chainId: chain.chainId,
    nonce,
    to: chain.token,
    data,
    value: 0n,
    gas: gasLimit,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });

  try {
    const claim = await prisma.treasuryWithdrawal.updateMany({
      where: { id: row.id, status: "PENDING", manualOnly: false },
      data: {
        status: "SENDING",
        payoutFrom: account.address.toLowerCase(),
        payoutNonce: nonce,
        payoutRawTx: raw,
        txHash: keccak256(raw),
        sentAt: new Date(),
        errorMessage: null,
      },
    });
    if (claim.count !== 1) return "Withdrawal was settled elsewhere.";
  } catch (error) {
    if (isUniqueViolation(error)) return "Another payout is in flight.";
    throw error;
  }
  // Persisted first, so a failed broadcast is retried by settle() on the next tick.
  await chain.broadcast(raw).catch((error) => console.warn("[payouts] broadcast failed; will retry", error));
  return null;
}

export async function processHotPayouts(
  prisma: PrismaClient = getPrisma(),
  env: EnvRecord = process.env,
  port?: { chain: PayoutChain; decimals: number },
  now = new Date(),
): Promise<PayoutResult> {
  const result: PayoutResult = { sent: 0, settled: 0, manual: 0, waiting: null };
  const account = payoutAccount(env);
  if (!account || !custodyEnabled(env as NodeJS.ProcessEnv)) return result;
  const resolved = port ?? viemPayoutChain(env);
  if (!resolved) return { ...result, waiting: "No RPC or asset configured for the cash asset." };
  const { chain, decimals } = resolved;

  // One in flight at a time: finish it before signing anything new.
  const inflight = await prisma.treasuryWithdrawal.findFirst({ where: { status: "SENDING" } });
  if (inflight) {
    if (await settle(prisma, chain, inflight)) result.settled += 1;
    else result.waiting = `Waiting for ${inflight.txHash} to mine.`;
    return result;
  }

  const { maxMicros, dailyMaxMicros } = payoutLimits(env);
  const sent = await prisma.treasuryWithdrawal.aggregate({
    where: { payoutFrom: { not: null }, sentAt: { gte: new Date(now.getTime() - DAY_MS) } },
    _sum: { amountMicros: true },
  });
  const sentToday = sent._sum.amountMicros ?? 0n;

  const next = await prisma.treasuryWithdrawal.findMany({
    where: { status: "PENDING", manualOnly: false, asset: CASH_ASSET },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const row of next) {
    if (row.amountMicros > maxMicros) {
      await toManual(prisma, row.id, "PENDING", `Above the ${maxMicros / 1_000_000n} automatic payout limit: needs an operator.`);
      result.manual += 1;
      continue;
    }
    // FIFO: a withdrawal over today's remaining cap waits rather than being overtaken.
    if (sentToday + row.amountMicros > dailyMaxMicros) {
      result.waiting = "Daily automatic payout cap reached.";
      return result;
    }
    const float = await chain.tokenBalance(account.address);
    if (float < toBaseUnits(row.amountMicros, decimals)) {
      result.waiting = "Payout wallet float is below the next withdrawal. Top it up from the treasury.";
      return result;
    }
    const blocked = await send(prisma, chain, account, row, decimals);
    if (blocked) result.waiting = blocked;
    else result.sent += 1;
    return result;
  }
  return result;
}
