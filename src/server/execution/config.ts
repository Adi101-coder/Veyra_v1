export type ExecutionEngineConfig = {
  maxAttempts: number;
  maxSliceSharesMicros: bigint;
  maxStaleBps: number;
  maxBookAgeMs: number;
  shareLotMicros: bigint;
  takerFeeBps: number;
  /** Aggregated venue orders never walk further than this past the touch. */
  maxSlippageBps: number;
  /** No venue order when the live spread is wider than this. */
  maxSpreadBps: number;
  /** A venue call slower than this is treated as an unknown outcome (never retried). */
  venueTimeoutMs: number;
  /** Unknown orders without an id are checked against venue activity after this long. */
  unknownOrderGraceMs: number;
  /** Lease a worker holds while reconciling one batch. */
  reconcileLeaseMs: number;
};

const DEFAULTS: ExecutionEngineConfig = {
  maxAttempts: 3,
  maxSliceSharesMicros: 50_000_000_000n,
  maxStaleBps: 500,
  maxBookAgeMs: 15_000,
  shareLotMicros: 10_000n,
  takerFeeBps: 0,
  maxSlippageBps: 500,
  maxSpreadBps: 2_000,
  venueTimeoutMs: 10_000,
  unknownOrderGraceMs: 120_000,
  reconcileLeaseMs: 60_000,
};

function envInt(env: Record<string, string | undefined>, key: string, fallback: number) {
  const raw = env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function loadExecutionEngineConfig(
  env: Record<string, string | undefined> = process.env,
): ExecutionEngineConfig {
  const slice = envInt(env, "VEYRA_EXECUTION_MAX_SLICE_SHARES", Number(DEFAULTS.maxSliceSharesMicros / 1_000_000n));
  return {
    maxAttempts: Math.max(1, envInt(env, "VEYRA_EXECUTION_MAX_ATTEMPTS", DEFAULTS.maxAttempts)),
    maxSliceSharesMicros: BigInt(Math.max(1, slice)) * 1_000_000n,
    maxStaleBps: envInt(env, "VEYRA_MAX_STALE_BPS", DEFAULTS.maxStaleBps),
    maxBookAgeMs: envInt(env, "VEYRA_EXECUTION_MAX_BOOK_AGE_MS", DEFAULTS.maxBookAgeMs),
    shareLotMicros: DEFAULTS.shareLotMicros,
    takerFeeBps: Math.max(0, envInt(env, "VEYRA_TAKER_FEE_BPS", DEFAULTS.takerFeeBps)),
    maxSlippageBps: Math.max(0, envInt(env, "VEYRA_MAX_SLIPPAGE_BPS", DEFAULTS.maxSlippageBps)),
    maxSpreadBps: Math.max(1, envInt(env, "VEYRA_EXECUTION_MAX_SPREAD_BPS", DEFAULTS.maxSpreadBps)),
    venueTimeoutMs: Math.max(1_000, envInt(env, "VEYRA_VENUE_TIMEOUT_MS", DEFAULTS.venueTimeoutMs)),
    unknownOrderGraceMs: Math.max(10_000, envInt(env, "VEYRA_UNKNOWN_ORDER_GRACE_MS", DEFAULTS.unknownOrderGraceMs)),
    reconcileLeaseMs: Math.max(5_000, envInt(env, "VEYRA_RECONCILE_LEASE_MS", DEFAULTS.reconcileLeaseMs)),
  };
}

export const defaultExecutionEngineConfig = loadExecutionEngineConfig({});
