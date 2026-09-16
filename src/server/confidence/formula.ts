import { clampInt, floorToTick, PRICE_BPS_SCALE } from "@/server/money";
import type { ConfidenceEngineConfig } from "@/server/confidence/config";

/** Full Kelly for a binary contract paying $1: (p - q) / (1 - q), in bps of bankroll. */
export function rawKellyBps(confidenceBps: number, marketPriceBps: number) {
  const edge = confidenceBps - marketPriceBps;
  const remainder = PRICE_BPS_SCALE - marketPriceBps;
  if (remainder <= 0) return 0;
  if (edge <= 0) return 0;
  return Math.floor((edge * PRICE_BPS_SCALE) / remainder);
}

export function sizedKellyBps(raw: number, config: ConfidenceEngineConfig) {
  const scaled = Math.floor((raw * config.kellyFractionBps) / PRICE_BPS_SCALE);
  return clampInt(scaled, 0, config.maxKellyBps);
}

export function sizedNotionalMicros(stakeMicros: bigint, kellyBps: number) {
  if (kellyBps <= 0) return 0n;
  return (stakeMicros * BigInt(kellyBps)) / BigInt(PRICE_BPS_SCALE);
}

/**
 * Limit is a tick-aligned price between the best ask and the user's fair value.
 * Never pays above fair value. Never walks more than maxSlippage past the ask.
 */
export function limitPriceBps(
  bestAskBps: number,
  fairBps: number,
  tickBps: number,
  config: ConfidenceEngineConfig,
) {
  if (fairBps < bestAskBps) return 0;
  const towardFair = Math.floor(
    ((fairBps - bestAskBps) * config.priceAggressivenessBps) / PRICE_BPS_SCALE,
  );
  const uncapped = bestAskBps + towardFair;
  const slipped = bestAskBps + config.maxSlippageBps;
  const capped = Math.min(uncapped, slipped, fairBps);
  return floorToTick(Math.max(capped, bestAskBps), tickBps);
}

export function edgeBps(confidenceBps: number, marketPriceBps: number) {
  return confidenceBps - marketPriceBps;
}

/** Lowest bid price we will accept when reducing a long. */
export function sellLimitPriceBps(bestBidBps: number, tickBps: number, config: ConfidenceEngineConfig) {
  if (bestBidBps <= 0) return 0;
  const slipped = Math.max(tickBps, bestBidBps - config.maxSlippageBps);
  return floorToTick(slipped, tickBps);
}
