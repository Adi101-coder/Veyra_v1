import "server-only";

import type { ResolutionOutcome } from "@/server/reputation/types";

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
  const response = await fetch(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Gamma ${response.status}`);
  return resolutionFromGamma((await response.json()) as GammaMarket);
}
