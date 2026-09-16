import "server-only";

import { getMarket, yesChance } from "@/lib/markets";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import { BettingError } from "@/server/errors";
import { getPrisma } from "@/server/db";
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
  if (local) return chanceToBps(yesChance(local));
  try {
    const live = await fetchPolymarketMarket(marketId);
    if (live) return chanceToBps(yesChance(live));
  } catch {
    // Fall through to the stored book.
  }
  const stored = await getPrisma().market.findUnique({
    where: { id: marketId },
    select: { yesPriceBps: true },
  });
  if (stored) return stored.yesPriceBps;
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

export function convictionStreamIntervalMs() {
  return loadConvictionEngineConfig().streamIntervalMs;
}

export { defaultConvictionEngineConfig };
