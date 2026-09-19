import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import { closePoolLiquidity } from "@/server/pools/fund";

/**
 * Settles a Veyra pool once its market has been resolved and scored.
 *
 * The fee and the pool's result both come from `PredictionScore.pnlMicros`, which
 * reputation already computes from actual filled cost and sell proceeds. Computing
 * profit a second time here would let the two drift apart and stop the fund tying
 * out against the ledger, so this reads those rows rather than recalculating.
 *
 * The pool is the sole counterparty to every trade in it, so its realised result is
 * exactly the negative of the traders' aggregate result.
 *
 * Paper mode: no money moves. These entries are the accounting record of what the
 * fund would have earned or lost, which is the point of running paper first.
 */

export type PoolSettlement = {
  marketId: string;
  traderPnlMicros: bigint;
  poolRealisedMicros: bigint;
  feeMicros: bigint;
};

export async function settleResolvedPools(
  prisma: PrismaClient = getPrisma(),
): Promise<PoolSettlement[]> {
  const open = await prisma.poolLiquidity.findMany({ where: { status: "ACTIVE" } });
  if (open.length === 0) return [];

  const settled: PoolSettlement[] = [];
  for (const pool of open) {
    const market = await prisma.market.findUnique({ where: { id: pool.marketId } });
    if (!market?.resolvedAt) continue;

    // Only settle once scoring for this market has finished, otherwise the fee
    // would be taken on a partial set of positions.
    const job = await prisma.reputationJob.findUnique({ where: { marketId: pool.marketId } });
    if (!job || job.status !== "DONE") continue;

    const scores = await prisma.predictionScore.findMany({
      where: { marketId: pool.marketId },
      select: { pnlMicros: true },
    });
    const traderPnlMicros = scores.reduce((sum, row) => sum + row.pnlMicros, 0n);
    const winnersProfitMicros = scores.reduce(
      (sum, row) => (row.pnlMicros > 0n ? sum + row.pnlMicros : sum),
      0n,
    );
    // Fee rounds down, in the trader's favour.
    const feeMicros = (winnersProfitMicros * BigInt(pool.feeBps)) / 10_000n;
    const poolRealisedMicros = -traderPnlMicros;

    const result = await closePoolLiquidity(prisma, pool.marketId, poolRealisedMicros, feeMicros);
    if (!result.closed) continue;
    settled.push({
      marketId: pool.marketId,
      traderPnlMicros,
      poolRealisedMicros,
      feeMicros,
    });
  }
  return settled;
}
