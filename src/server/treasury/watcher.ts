import "server-only";

import type { PrismaClient } from "@prisma/client";
import { createPublicClient, http, parseAbiItem, TransactionReceiptNotFoundError, type Hex } from "viem";
import { getPrisma } from "@/server/db";
import { loadSupportedAssets, treasuryAddress } from "@/server/treasury/config";
import { creditDeposit, reverseDeposit } from "@/server/treasury/ledger";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type ObservedTransfer = {
  walletAddress: string;
  asset: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  amountBase: bigint;
};

export function confirmationDepth(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number.parseInt((env.VEYRA_DEPOSIT_CONFIRMATIONS ?? "12").trim(), 10);
  if (!Number.isInteger(raw) || raw < 1 || raw > 256) return 12;
  return raw;
}

/**
 * Credits transfers the watcher has already confirmed. Same idempotency as the
 * operator deposits endpoint.
 */
export async function applyConfirmedDeposits(
  prisma: PrismaClient,
  transfers: ObservedTransfer[],
  env: NodeJS.ProcessEnv = process.env,
) {
  let credited = 0;
  for (const transfer of transfers) {
    const result = await creditDeposit(prisma, transfer, env);
    if (result.credited) credited += 1;
  }
  return { credited, observed: transfers.length };
}

/**
 * Reverses CREDITED deposits whose transaction is no longer present at the
 * required confirmation depth.
 */
export async function reverseMissingDeposits(
  prisma: PrismaClient,
  stillPresent: Set<string>,
) {
  const credited = await prisma.treasuryDeposit.findMany({ where: { status: "CREDITED" } });
  let reversed = 0;
  for (const deposit of credited) {
    const key = `${deposit.chainId}:${deposit.txHash}:${deposit.logIndex}`;
    if (stillPresent.has(key)) continue;
    const result = await reverseDeposit(prisma, deposit.id);
    if (result.reversed) reversed += 1;
  }
  return { reversed };
}

function rpcUrl(chainId: number, env: NodeJS.ProcessEnv) {
  const keyed = (env[`VEYRA_RPC_URL_${chainId}`] ?? "").trim();
  if (keyed) return keyed;
  return (env.VEYRA_RPC_URL ?? "").trim();
}

/**
 * Polls the treasury address for ERC-20 Transfer logs past confirmation depth.
 * No-ops when treasury, assets, or RPC are unset.
 */
export async function watchDeposits(
  prisma: PrismaClient = getPrisma(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const treasury = treasuryAddress(env);
  const assets = loadSupportedAssets(env);
  if (!treasury || assets.length === 0) return { credited: 0, reversed: 0, scanned: 0 };

  const depth = confirmationDepth(env);
  const confirmed: ObservedTransfer[] = [];
  let scanned = 0;

  const byChain = new Map<number, typeof assets>();
  for (const asset of assets) {
    const list = byChain.get(asset.chainId) ?? [];
    list.push(asset);
    byChain.set(asset.chainId, list);
  }

  for (const [chainId, chainAssets] of byChain) {
    const url = rpcUrl(chainId, env);
    if (!url) continue;
    const client = createPublicClient({ transport: http(url) });
    const head = await client.getBlockNumber();
    if (head < BigInt(depth)) continue;
    const toBlock = head - BigInt(depth);
    const fromBlock = toBlock > 2_000n ? toBlock - 2_000n : 0n;

    for (const asset of chainAssets) {
      const logs = (await client.getLogs({
        address: asset.contract as Hex,
        event: transferEvent,
        args: { to: treasury as Hex },
        fromBlock,
        toBlock,
      })) as Array<{
        transactionHash: Hex;
        logIndex: number;
        args: { from?: Hex; value?: bigint };
      }>;
      scanned += logs.length;
      for (const log of logs) {
        const txHash = log.transactionHash.toLowerCase();
        const from = (log.args.from ?? "").toLowerCase();
        if (!from || from === treasury) continue;
        confirmed.push({
          walletAddress: from,
          asset: asset.symbol,
          chainId,
          txHash,
          logIndex: log.logIndex,
          amountBase: log.args.value ?? 0n,
        });
      }
    }
  }

  const applied = await applyConfirmedDeposits(prisma, confirmed.filter((row) => row.amountBase > 0n), env);

  let reversed = 0;
  const creditedRows = await prisma.treasuryDeposit.findMany({ where: { status: "CREDITED" } });
  for (const deposit of creditedRows) {
    const url = rpcUrl(deposit.chainId, env);
    if (!url) continue;
    const client = createPublicClient({ transport: http(url) });
    try {
      const receipt = await client.getTransactionReceipt({ hash: deposit.txHash as Hex });
      if (receipt.logs.some((log) => log.logIndex === deposit.logIndex)) continue;
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) continue;
    }
    const result = await reverseDeposit(prisma, deposit.id);
    if (result.reversed) reversed += 1;
  }

  return { credited: applied.credited, reversed, scanned };
}
