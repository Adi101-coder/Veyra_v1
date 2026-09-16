export type ExecutionEngineConfig = {
  maxAttempts: number;
  maxSliceSharesMicros: bigint;
  maxStaleBps: number;
  maxBookAgeMs: number;
  shareLotMicros: bigint;
  takerFeeBps: number;
};

const DEFAULTS: ExecutionEngineConfig = {
  maxAttempts: 3,
  maxSliceSharesMicros: 50_000_000_000n,
  maxStaleBps: 500,
  maxBookAgeMs: 15_000,
  shareLotMicros: 10_000n,
  takerFeeBps: 0,
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
  };
}

export const defaultExecutionEngineConfig = loadExecutionEngineConfig({});
