import "server-only";

import type { PrismaClient } from "@prisma/client";
import { executionFunderAddress, treasuryAddress, walletsAreSeparate } from "@/server/treasury/config";

/**
 * Where each user's Polymarket exposure comes from.
 *
 * Veyra trades the CLOB from one omnibus execution wallet, so on-chain there is no
 * per-user position. The mapping from a user to their share of that wallet is this
 * internal ledger: exposure is derived only from recorded fills (Position rows
 * change solely from fills, see betting/ledger.ts), never from intended orders.
 *
 * This is deliberately a separate accounting domain from the treasury ledger. A
 * user's deposits are custodial assets they own; their venue exposure is a claim
 * on the omnibus wallet. The two are never netted against each other.
 */

export type UserExposure = {
  walletAddress: string;
  /** Filled shares held, in 6-decimal micros, per market/outcome. */
  positions: {
    predictionId: string;
    marketId: string;
    outcome: string;
    tokenId: string;
    status: string;
    sharesMicros: string;
    notionalMicros: string;
  }[];
  totalNotionalMicros: string;
};

export async function exposureFor(prisma: PrismaClient, walletAddress: string): Promise<UserExposure> {
  const wallet = walletAddress.toLowerCase();
  const positions = await prisma.position.findMany({
    where: { walletAddress: wallet, sharesMicros: { gt: 0n } },
    orderBy: { createdAt: "desc" },
  });
  const total = positions.reduce((sum, row) => sum + row.notionalMicros, 0n);
  return {
    walletAddress: wallet,
    positions: positions.map((row) => ({
      predictionId: row.predictionId,
      marketId: row.marketId,
      outcome: row.outcome,
      tokenId: row.tokenId,
      status: row.status,
      sharesMicros: row.sharesMicros.toString(),
      notionalMicros: row.notionalMicros.toString(),
    })),
    totalNotionalMicros: total.toString(),
  };
}

/**
 * Operator view of the separation: which wallet is which, and the totals each
 * side accounts for. Deliberately reports addresses only — no keys, ever.
 */
export async function accountingSeparationReport(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
) {
  const treasury = treasuryAddress(env);
  const execution = executionFunderAddress(env);

  const [balances, exposure] = await Promise.all([
    prisma.treasuryBalance.groupBy({ by: ["asset"], _sum: { balanceBase: true }, _count: { _all: true } }),
    prisma.position.aggregate({
      where: { sharesMicros: { gt: 0n } },
      _sum: { sharesMicros: true, notionalMicros: true },
      _count: { _all: true },
    }),
  ]);

  return {
    wallets: {
      treasury: { address: treasury, role: "custody", usedForExecution: false },
      execution: {
        address: execution,
        role: "polymarket-clob",
        holdsUserDeposits: false,
      },
      separate: walletsAreSeparate(env),
    },
    treasuryLedger: balances.map((row) => ({
      asset: row.asset,
      holders: row._count._all,
      totalBase: (row._sum.balanceBase ?? 0n).toString(),
    })),
    executionLedger: {
      openPositions: exposure._count._all,
      totalSharesMicros: (exposure._sum.sharesMicros ?? 0n).toString(),
      totalNotionalMicros: (exposure._sum.notionalMicros ?? 0n).toString(),
    },
  };
}
