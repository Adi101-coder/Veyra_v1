import "server-only";

import { getMarket, yesChance } from "@/lib/markets";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import { BettingError } from "@/server/errors";
import { getPrisma } from "@/server/db";
import { fetchClobMidpoint } from "@/server/polymarket/clob";
import { ConvictionEngine } from "@/server/conviction/engine";
import {
  defaultConvictionEngineConfig,
  loadConvictionEngineConfig,
} from "@/server/conviction/config";
import { prismaConvictionStore } from "@/server/conviction/store";
import type { ConvictionDTO } from "@/server/conviction/types";

function chanceToBps(chance: number) {
  return Math.round(chance * 100);
}

export async function polymarketYesBps(marketId: string) {
  const local = getMarket(marketId);
  if (local && local.source !== "polymarket") return chanceToBps(yesChance(local));
  try {
    const live = await fetchPolymarketMarket(marketId);
    const yesToken = live?.clobTokenIds?.[0];
    if (yesToken) {
      // CLOB midpoint in bps is the precise YES probability (Gamma prices are rounded to 1%).
      const mid = await fetchClobMidpoint(yesToken).catch(() => null);
      if (mid != null) return mid;
    }
    if (live) return chanceToBps(yesChance(live));
  } catch {
    // Fall through to the stored price.
  }
  const stored = await getPrisma().market.findUnique({
    where: { id: marketId },
    select: { yesPriceBps: true },
  });
  if (stored) return stored.yesPriceBps;
  if (local) return chanceToBps(yesChance(local));
  throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
}

export function createConvictionEngine() {
  return new ConvictionEngine(loadConvictionEngineConfig(), prismaConvictionStore(getPrisma()));
}

export async function getMarketConviction(
  marketId: string,
  persist: "auto" | "always" | "never" = "auto",
): Promise<ConvictionDTO> {
  const engine = createConvictionEngine();
  const polymarketProbabilityBps = await polymarketYesBps(marketId);
  return engine.measure(marketId, polymarketProbabilityBps, { persist });
}

const shared = new Map<string, { at: number; value: Promise<ConvictionDTO> }>();

/**
 * One computation per market per interval, shared by every stream subscriber in
 * this process, so N open tabs cost one Gamma/CLOB call and one snapshot check.
 */
export function getSharedMarketConviction(marketId: string, maxAgeMs: number) {
  const now = Date.now();
  const cached = shared.get(marketId);
  if (cached && now - cached.at < maxAgeMs) return cached.value;
  const value = getMarketConviction(marketId);
  shared.set(marketId, { at: now, value });
  value.catch(() => shared.delete(marketId));
  if (shared.size > 1_000) {
    for (const [key, entry] of shared) if (now - entry.at >= maxAgeMs) shared.delete(key);
  }
  return value;
}

export function convictionStreamIntervalMs() {
  return loadConvictionEngineConfig().streamIntervalMs;
}

export { defaultConvictionEngineConfig };
