import "server-only";

/**
 * Veyra-native pool market making.
 *
 * Veyra is the counterparty for these pools, so every value here is a cap on how
 * much house capital one pool can lose. `poolBudgetMicros` is the worst case per
 * pool (`b * ln 2`), not a target spend.
 */

export type PoolConfig = {
  /** Worst-case house loss reserved per pool, in USDC micros. */
  poolBudgetMicros: bigint;
  /** Below this, a pool opens unfunded and stays unquotable rather than thinly priced. */
  minPoolBudgetMicros: bigint;
  /** Fee on trader profit at resolution, in bps. */
  feeBps: number;
  /** Operator capital that bootstraps the fund before any fees exist. */
  seedMicros: bigint;
  /** Shares per ladder level. */
  lotMicros: bigint;
  /** Ladder price granularity, bps. */
  tickBps: number;
  /** Ladder depth. */
  maxLevels: number;
};

const bigintFrom = (raw: string | undefined, fallback: bigint) => {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return fallback;
  return BigInt(value);
};

const intFrom = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
};

export function loadPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    // $250 of exposure per pool by default: 5 pools/day is $1,250/day worst case.
    poolBudgetMicros: bigintFrom(env.VEYRA_POOL_BUDGET_MICROS, 250_000_000n),
    minPoolBudgetMicros: bigintFrom(env.VEYRA_POOL_MIN_BUDGET_MICROS, 25_000_000n),
    // 2% of profit. Break-even forecasting accuracy on a coin flip is ~50.5%.
    feeBps: intFrom(env.VEYRA_POOL_FEE_BPS, 200, 0, 10_000),
    seedMicros: bigintFrom(env.VEYRA_LIQUIDITY_FUND_SEED_MICROS, 0n),
    lotMicros: bigintFrom(env.VEYRA_POOL_LOT_MICROS, 1_000_000n),
    tickBps: intFrom(env.VEYRA_POOL_TICK_BPS, 100, 1, 1_000),
    maxLevels: intFrom(env.VEYRA_POOL_MAX_LEVELS, 60, 1, 500),
  };
}
