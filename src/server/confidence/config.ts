import { parseUsdMicros } from "@/server/money";

export type ConfidenceEngineConfig = {
  version: string;
  minConfidenceBps: number;
  maxConfidenceBps: number;
  minStakeMicros: bigint;
  maxStakeMicros: bigint;
  minEdgeBps: number;
  kellyFractionBps: number;
  maxKellyBps: number;
  priceAggressivenessBps: number;
  maxSlippageBps: number;
  maxStaleBps: number;
  shareLotMicros: bigint;
  orderType: "FAK" | "FOK" | "GTC";
  /** Polymarket refuses marketable orders below this notional (currently $1). */
  minVenueNotionalMicros: bigint;
  /** Entry refused when (ask - bid) / mid exceeds this; a round trip would lose it. */
  maxRelativeSpreadBps: number;
};

const DEFAULTS: ConfidenceEngineConfig = {
  version: "v1",
  minConfidenceBps: 100,
  maxConfidenceBps: 9900,
  minStakeMicros: 1_000_000n,
  maxStakeMicros: 100_000_000_000n,
  minEdgeBps: 50,
  kellyFractionBps: 2500,
  maxKellyBps: 5000,
  priceAggressivenessBps: 3500,
  maxSlippageBps: 500,
  maxStaleBps: 500,
  shareLotMicros: 10_000n,
  orderType: "FAK",
  minVenueNotionalMicros: 1_000_000n,
  maxRelativeSpreadBps: 1_000,
};

function envInt(env: Record<string, string | undefined>, key: string, fallback: number) {
  const raw = env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function envUsd(env: Record<string, string | undefined>, key: string, fallback: bigint) {
  const raw = env[key];
  if (!raw) return fallback;
  try {
    return parseUsdMicros(raw, "reject");
  } catch {
    return fallback;
  }
}

export function loadConfidenceEngineConfig(
  env: Record<string, string | undefined> = process.env,
): ConfidenceEngineConfig {
  const orderTypeRaw = (env.VEYRA_ORDER_TYPE ?? DEFAULTS.orderType).toUpperCase();
  const orderType =
    orderTypeRaw === "FOK" || orderTypeRaw === "GTC" || orderTypeRaw === "FAK"
      ? orderTypeRaw
      : DEFAULTS.orderType;

  return {
    version: env.VEYRA_ENGINE_VERSION ?? DEFAULTS.version,
    minConfidenceBps: envInt(env, "VEYRA_MIN_CONFIDENCE_BPS", DEFAULTS.minConfidenceBps),
    maxConfidenceBps: envInt(env, "VEYRA_MAX_CONFIDENCE_BPS", DEFAULTS.maxConfidenceBps),
    minStakeMicros: envUsd(env, "VEYRA_MIN_STAKE_USD", DEFAULTS.minStakeMicros),
    maxStakeMicros: envUsd(env, "VEYRA_MAX_STAKE_USD", DEFAULTS.maxStakeMicros),
    minEdgeBps: envInt(env, "VEYRA_MIN_EDGE_BPS", DEFAULTS.minEdgeBps),
    kellyFractionBps: envInt(env, "VEYRA_KELLY_FRACTION_BPS", DEFAULTS.kellyFractionBps),
    maxKellyBps: envInt(env, "VEYRA_MAX_KELLY_BPS", DEFAULTS.maxKellyBps),
    priceAggressivenessBps: envInt(
      env,
      "VEYRA_PRICE_AGGRESSIVENESS_BPS",
      DEFAULTS.priceAggressivenessBps,
    ),
    maxSlippageBps: envInt(env, "VEYRA_MAX_SLIPPAGE_BPS", DEFAULTS.maxSlippageBps),
    maxStaleBps: envInt(env, "VEYRA_MAX_STALE_BPS", DEFAULTS.maxStaleBps),
    shareLotMicros: DEFAULTS.shareLotMicros,
    orderType,
    minVenueNotionalMicros: envUsd(env, "VEYRA_MIN_VENUE_ORDER_USD", DEFAULTS.minVenueNotionalMicros),
    maxRelativeSpreadBps: envInt(env, "VEYRA_MAX_RELATIVE_SPREAD_BPS", DEFAULTS.maxRelativeSpreadBps),
  };
}

export const defaultConfidenceEngineConfig = loadConfidenceEngineConfig({});
