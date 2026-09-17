import "server-only";

import { getMarket } from "@/lib/markets";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import { BettingError } from "@/server/errors";
import { getPrisma } from "@/server/db";
import { fetchClobMidpoint } from "@/server/polymarket/clob";
import { ConvictionEngine } from "@/server/conviction/engine";
import { defaultConvictionEngineConfig, loadConvictionEngineConfig } from "@/server/conviction/config";
import { prismaConvictionStore } from "@/server/conviction/store";
import type { ConvictionDTO, PolymarketReference } from "@/server/conviction/types";

/**
 * Current Polymarket YES probability: the CLOB midpoint of the YES token only.
 * Catalog (demo) markets and markets without a two-sided book report "unavailable"
 * rather than a rounded Gamma price or a static catalog number.
 */
export async function polymarketReference(marketId: string): Promise<PolymarketReference> {
  const local = getMarket(marketId);
  const stored = await getPrisma().market.findUnique({
    where: { id: marketId },
    select: { source: true, clobTokenYes: true },
  });
  if (local && local.source !== "polymarket" && !stored) return { probabilityBps: null, source: "unavailable" };
  let yesToken = stored?.clobTokenYes ?? null;
  if (!yesToken && (!local || local.source === "polymarket")) {
    const live = await fetchPolymarketMarket(marketId).catch(() => null);
    if (!live && !local && !stored) throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
    yesToken = live?.clobTokenIds?.[0] ?? null;
  }
  if (!yesToken) return { probabilityBps: null, source: "unavailable" };
  const mid = await fetchClobMidpoint(yesToken).catch(() => null);
  return mid == null ? { probabilityBps: null, source: "unavailable" } : { probabilityBps: mid, source: "clob_midpoint" };
}

export function createConvictionEngine() {
  return new ConvictionEngine(loadConvictionEngineConfig(), prismaConvictionStore(getPrisma()));
}

export async function getMarketConviction(marketId: string): Promise<ConvictionDTO> {
  return createConvictionEngine().measure(marketId, await polymarketReference(marketId));
}

const shared = new Map<string, { at: number; value: Promise<ConvictionDTO> }>();

/**
 * One computation per market per interval, shared by every stream subscriber in
 * this process, so N open tabs cost one CLOB call and one snapshot write.
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
