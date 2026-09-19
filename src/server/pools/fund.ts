import "server-only";

import type { PrismaClient } from "@prisma/client";
import { BettingError } from "@/server/errors";
import { isUniqueViolation } from "@/server/prisma-retry";
import { bForBudgetMicros, maxLossMicros } from "@/server/pools/lmsr";
import { loadPoolConfig, type PoolConfig } from "@/server/pools/config";

/**
 * The liquidity fund.
 *
 * Trading fees flow in; each pool that opens reserves its bounded worst-case loss
 * (`b * ln 2`) out of the fund. Whatever is not reserved by an open pool is the
 * reserve, which is simply the unallocated remainder rather than a separate pot.
 *
 * Every balance is derived by summing append-only entries, so the fund can always
 * be reconstructed and audited. The unique (refType, refId, kind) index means a
 * retried job can never double-count a fee or an allocation.
 */

export type FundBalances = {
  /** Everything the fund holds: seed + fees - losses. */
  totalMicros: bigint;
  /** Reserved by pools that are still open. */
  allocatedMicros: bigint;
  /** Unallocated remainder, available to open the next pools. */
  reserveMicros: bigint;
};

export async function fundBalances(prisma: PrismaClient): Promise<FundBalances> {
  const [entries, active] = await Promise.all([
    prisma.liquidityFundEntry.aggregate({ _sum: { deltaMicros: true } }),
    prisma.poolLiquidity.aggregate({
      where: { status: "ACTIVE" },
      _sum: { allocatedMicros: true },
    }),
  ]);
  const totalMicros = entries._sum.deltaMicros ?? 0n;
  const allocatedMicros = active._sum.allocatedMicros ?? 0n;
  return { totalMicros, allocatedMicros, reserveMicros: totalMicros - allocatedMicros };
}

/**
 * Records the operator's starting capital. The fund is bootstrapped this way, not
 * by fees: at launch there is no trading, so there are no fees to seed it with.
 * Idempotent per reference, so re-running the boot path cannot double-seed.
 */
export async function seedFund(
  prisma: PrismaClient,
  amountMicros: bigint,
  reference: string,
  memo?: string,
) {
  if (amountMicros <= 0n) throw new BettingError("INVALID_SEED", "Seed amount must be positive.", 400);
  try {
    await prisma.liquidityFundEntry.create({
      data: { deltaMicros: amountMicros, kind: "SEED", refType: "OperatorSeed", refId: reference, memo },
    });
    return { seeded: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { seeded: false };
  }
}

/**
 * Opens a pool by reserving its worst-case loss from the fund's reserve.
 *
 * Returns null when the reserve cannot cover a pool of at least the configured
 * minimum. The caller must leave the pool unquotable in that case rather than
 * falling back to some default book: an unfunded pool has no counterparty, and
 * quoting one anyway is exactly the bug that made pools look tradeable when they
 * were not.
 */
export async function openPoolLiquidity(
  prisma: PrismaClient,
  marketId: string,
  roundId: string | null,
  config: PoolConfig = loadPoolConfig(),
) {
  const existing = await prisma.poolLiquidity.findUnique({ where: { marketId } });
  if (existing) return existing;

  const balances = await fundBalances(prisma);
  const budget =
    balances.reserveMicros >= config.poolBudgetMicros ? config.poolBudgetMicros : balances.reserveMicros;
  if (budget < config.minPoolBudgetMicros) return null;

  const bMicros = bForBudgetMicros(budget);
  if (bMicros <= 0n) return null;
  const allocatedMicros = maxLossMicros(bMicros);

  try {
    const pool = await prisma.poolLiquidity.create({
      data: {
        marketId,
        bMicros,
        allocatedMicros,
        roundId,
        feeBps: config.feeBps,
        status: "ACTIVE",
      },
    });
    await prisma.liquidityFundEntry.create({
      data: {
        // Allocation does not leave the fund; it is reserved against this pool and
        // released when the pool closes. Recorded for audit, net zero on the total.
        deltaMicros: 0n,
        kind: "ALLOCATION",
        refType: "PoolLiquidity",
        refId: pool.id,
        memo: `reserved ${allocatedMicros} micros for ${marketId}`,
      },
    });
    return pool;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return prisma.poolLiquidity.findUnique({ where: { marketId } });
  }
}

/** The pool's liquidity, or null when it was never funded. */
export async function poolLiquidity(prisma: PrismaClient, marketId: string) {
  return prisma.poolLiquidity.findUnique({ where: { marketId } });
}

/**
 * Closes a pool at resolution: releases its reservation and books the realised
 * result. A pool that took in more than it pays out returns the difference to the
 * fund; one that paid out more books the shortfall as a loss, bounded by its
 * allocation.
 */
export async function closePoolLiquidity(
  prisma: PrismaClient,
  marketId: string,
  realisedMicros: bigint,
  feeMicros: bigint,
) {
  const pool = await prisma.poolLiquidity.findUnique({ where: { marketId } });
  if (!pool || pool.status !== "ACTIVE") return { closed: false };

  const claim = await prisma.poolLiquidity.updateMany({
    where: { id: pool.id, status: "ACTIVE" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  if (claim.count !== 1) return { closed: false };

  if (realisedMicros !== 0n) {
    await prisma.liquidityFundEntry.create({
      data: {
        deltaMicros: realisedMicros,
        kind: realisedMicros >= 0n ? "RELEASE" : "LOSS",
        refType: "PoolLiquidity",
        refId: pool.id,
        memo: `pool ${marketId} settled`,
      },
    });
  }
  if (feeMicros > 0n) {
    await prisma.liquidityFundEntry.create({
      data: {
        deltaMicros: feeMicros,
        kind: "FEE",
        refType: "PoolFee",
        refId: pool.id,
        memo: `fees from ${marketId}`,
      },
    });
  }
  return { closed: true };
}
