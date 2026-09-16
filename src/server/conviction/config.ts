export type ConvictionEngineConfig = {
  version: string;
  /** Share of headline conviction taken from capital-weighted confidence. 5500 = 55%. */
  capitalBlendBps: number;
  snapshotIntervalMs: number;
  snapshotMinDeltaBps: number;
  trailLength: number;
  streamIntervalMs: number;
  binCount: number;
};

const DEFAULTS: ConvictionEngineConfig = {
  version: "v1",
  capitalBlendBps: 5500,
  snapshotIntervalMs: 300_000,
  snapshotMinDeltaBps: 50,
  trailLength: 8,
  streamIntervalMs: 5_000,
  binCount: 10,
};

function envInt(env: Record<string, string | undefined>, key: string, fallback: number) {
  const raw = env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function loadConvictionEngineConfig(
  env: Record<string, string | undefined> = process.env,
): ConvictionEngineConfig {
  return {
    version: env.VEYRA_CONVICTION_VERSION ?? DEFAULTS.version,
    capitalBlendBps: envInt(env, "VEYRA_CONVICTION_CAPITAL_BLEND_BPS", DEFAULTS.capitalBlendBps),
    snapshotIntervalMs: envInt(
      env,
      "VEYRA_CONVICTION_SNAPSHOT_INTERVAL_MS",
      DEFAULTS.snapshotIntervalMs,
    ),
    snapshotMinDeltaBps: envInt(
      env,
      "VEYRA_CONVICTION_SNAPSHOT_MIN_DELTA_BPS",
      DEFAULTS.snapshotMinDeltaBps,
    ),
    trailLength: envInt(env, "VEYRA_CONVICTION_TRAIL_LENGTH", DEFAULTS.trailLength),
    streamIntervalMs: envInt(
      env,
      "VEYRA_CONVICTION_STREAM_INTERVAL_MS",
      DEFAULTS.streamIntervalMs,
    ),
    binCount: envInt(env, "VEYRA_CONVICTION_BIN_COUNT", DEFAULTS.binCount),
  };
}

export const defaultConvictionEngineConfig = loadConvictionEngineConfig({});
