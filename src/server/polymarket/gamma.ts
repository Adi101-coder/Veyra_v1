import "server-only";

import type { ResolutionOutcome } from "@/server/reputation/types";
import { polymarketJson } from "@/lib/polymarket-http";

const GAMMA = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";

type GammaMarket = {
  slug?: string;
  closed?: boolean;
  outcomes?: string;
  outcomePrices?: string;
  umaResolutionStatus?: string | null;
};

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export type VenueResolution = { resolved: false } | { resolved: true; outcome: ResolutionOutcome };

/**
 * Official resolution state from the Gamma API. A market is final only when it is
 * closed and UMA reports "resolved"; the winner is the outcome priced at "1".
 * Closed-and-resolved without a 1/0 split (e.g. 0.5/0.5) is treated as INVALID.
 */
export function resolutionFromGamma(market: GammaMarket): VenueResolution {
  if (market.closed !== true || (market.umaResolutionStatus ?? "").toLowerCase() !== "resolved") {
    return { resolved: false };
  }
  const labels = parseList(market.outcomes).map((label) => label.trim().toUpperCase());
  const prices = parseList(market.outcomePrices).map((price) => price.trim());
  const winner = prices.findIndex((price) => price === "1" || price === "1.0");
  const label = winner >= 0 ? labels[winner] : undefined;
  if (label === "YES" || label === "NO") return { resolved: true, outcome: label };
  return { resolved: true, outcome: "INVALID" };
}

export async function fetchVenueResolution(slug: string): Promise<VenueResolution | null> {
  try {
    const raw = (await polymarketJson(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`, 20_000)) as GammaMarket;
    return resolutionFromGamma(raw);
  } catch (error) {
    if (error instanceof Error && /404/.test(error.message)) return null;
    throw error;
  }
}
