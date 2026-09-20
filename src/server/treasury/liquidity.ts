import "server-only";

import type { PrismaClient } from "@prisma/client";
import { createPublicClient, erc20Abi, http } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { getPrisma } from "@/server/db";
import { treasuryAddress } from "@/server/treasury/config";
import { CASH_ASSET } from "@/server/treasury/funds";
import { POLYGON_USDC, POLYGON_USDC_E } from "@/server/treasury/omnibus-onchain";

/**
 * Payout liquidity in the treasury wallet (X).
 *
 * User money stays in X the whole time a bet is open; the trade itself runs from
 * the execution wallet (Y). So when a bet wins, Y holds the proceeds while X owes
 * the payout — X drains and Y accumulates, and nothing moves between them. Left
 * alone, withdrawals eventually fail while Veyra is holding the money.
 *
 * This reports how much to sweep from Y to X. The sweep itself is operator-executed
 * like withdrawals: the server holds no treasury key, and Y's key stays trading-only.
 *
 * It alerts on a threshold with a buffer rather than when X is already empty —
 * reactive sweeping means the first user past the shortfall gets a failed cash-out.
 */

type EnvRecord = Record<string, string | undefined>;

export type TreasuryLiquidity = {
  treasuryAddress: string | null;
  /** Live on-chain USDC in X, or null when it could not be read. */
  onchainMicros: string | null;
  /** Everything the ledger says users can take out of X right now. */
  claimsMicros: string;
  pendingWithdrawalsMicros: string;
  /** Cover required before the buffer. */
  requiredMicros: string;
  bufferMicros: string;
  /** Amount to move from Y to X. Zero when X is comfortable. */
  sweepMicros: string;
  status: "ok" | "low" | "short" | "unknown";
};

function chainFor(env: EnvRecord) {
  return env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
}

/** Live USDC held by the treasury wallet, summing both Polygon USDC variants. */
export async function readTreasuryUsdc(env: EnvRecord = process.env): Promise<bigint | null> {
  const address = treasuryAddress(env as NodeJS.ProcessEnv);
  const rpc = (env.POLYGON_RPC_URL ?? "").trim();
  if (!address || !rpc) return null;

  const client = createPublicClient({ chain: chainFor(env), transport: http(rpc) });
  const [usdcE, usdc] = await Promise.all([
    client.readContract({
      address: POLYGON_USDC_E,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }),
    client.readContract({
      address: POLYGON_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }),
  ]);
  return usdcE + usdc;
}

/**
 * How much X must hold, and how far short it is.
 *
 * Claims are every user's spendable balance plus anything held against an open
 * order: a hold is still the user's money, it is simply committed. Pending
 * withdrawals are already debited from balances, so they are counted separately.
 */
export async function treasuryLiquidity(
  prisma: PrismaClient = getPrisma(),
  env: EnvRecord = process.env,
  onchainOverride?: bigint | null,
): Promise<TreasuryLiquidity> {
  const [balances, holds, pending] = await Promise.all([
    prisma.treasuryBalance.aggregate({ where: { asset: CASH_ASSET }, _sum: { balanceBase: true } }),
    prisma.fundsHold.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountMicros: true, spentMicros: true },
    }),
    prisma.treasuryWithdrawal.aggregate({
      where: { status: "PENDING" },
      _sum: { amountMicros: true },
    }),
  ]);

  const claims =
    (balances._sum.balanceBase ?? 0n) +
    ((holds._sum.amountMicros ?? 0n) - (holds._sum.spentMicros ?? 0n));
  const pendingWithdrawals = pending._sum.amountMicros ?? 0n;
  const required = claims + pendingWithdrawals;

  const bufferBps = BigInt(
    Math.min(10_000, Math.max(0, Number.parseInt(env.VEYRA_TREASURY_BUFFER_BPS ?? "1000", 10) || 0)),
  );
  const buffer = (required * bufferBps) / 10_000n;

  const onchain =
    onchainOverride !== undefined ? onchainOverride : await readTreasuryUsdc(env).catch(() => null);

  let status: TreasuryLiquidity["status"] = "unknown";
  let sweep = 0n;
  if (onchain != null) {
    if (onchain < required) {
      // Cannot cover what users are owed today.
      status = "short";
      sweep = required + buffer - onchain;
    } else if (onchain < required + buffer) {
      // Still covered, but inside the buffer: sweep now rather than after a failure.
      status = "low";
      sweep = required + buffer - onchain;
    } else {
      status = "ok";
    }
  }

  return {
    treasuryAddress: treasuryAddress(env as NodeJS.ProcessEnv),
    onchainMicros: onchain?.toString() ?? null,
    claimsMicros: claims.toString(),
    pendingWithdrawalsMicros: pendingWithdrawals.toString(),
    requiredMicros: required.toString(),
    bufferMicros: buffer.toString(),
    sweepMicros: sweep.toString(),
    status,
  };
}
