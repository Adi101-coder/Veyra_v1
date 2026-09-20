import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import { creditCash, debitCash, settlesInCash } from "@/server/treasury/funds";
import { poolPayoutsOpen } from "@/server/treasury/dispute";
import { VEYRA_POOL_SOURCE } from "@/server/voting/config";

/**
 * Pays resolved positions from reputation's recorded numbers.
 *
 * PAYOUT is `PredictionScore.payoutMicros` when the forecast was correct — that
 * field is the $1/share held size scoring already used. FEE_DEBIT is the same
 * floor(positive pnl * feeBps / 10_000) pool settlement uses. Referencing
 * Position.id makes both idempotent.
 */
export async function payoutResolvedPositions(prisma: PrismaClient = getPrisma()) {
  const scores = await prisma.predictionScore.findMany({
    include: {
      prediction: {
        include: {
          position: { include: { executions: { select: { mode: true } } } },
          market: true,
        },
      },
    },
  });

  let paid = 0;
  let fees = 0;
  const failures: { positionId: string; error: string }[] = [];
  for (const score of scores) {
    const position = score.prediction.position;
    if (!position) continue;
    const live = position.executions.some((row) => settlesInCash(row.mode));
    if (!live) continue;
    if (!poolPayoutsOpen(score.prediction.market)) continue;

    try {
      if (score.correct && score.payoutMicros > 0n) {
        const result = await creditCash(prisma, {
          walletAddress: score.walletAddress,
          amountMicros: score.payoutMicros,
          kind: "PAYOUT",
          refType: "Position",
          refId: position.id,
        });
        if (result.credited) paid += 1;
      }

      if (score.prediction.market.source === VEYRA_POOL_SOURCE && score.pnlMicros > 0n) {
        const pool = await prisma.poolLiquidity.findUnique({ where: { marketId: score.marketId } });
        if (!pool) continue;
        const feeMicros = (score.pnlMicros * BigInt(pool.feeBps)) / 10_000n;
        if (feeMicros <= 0n) continue;
        const result = await debitCash(prisma, {
          walletAddress: score.walletAddress,
          amountMicros: feeMicros,
          kind: "FEE_DEBIT",
          refType: "Position",
          refId: position.id,
        });
        if (result.debited) fees += 1;
      }
    } catch (error) {
      // One wallet must not abort the tick. A failing fee debit used to throw here
      // and re-throw on every later tick, so a single stuck balance froze payouts
      // for everyone.
      failures.push({
        positionId: position.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (failures.length > 0) {
    console.error("[custody] payout failures this tick", { count: failures.length, failures });
  }
  return { paid, fees, failed: failures.length };
}
