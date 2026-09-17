import type { Market as CatalogMarket } from "@/lib/markets";
import type { OrderBookSnapshot, Outcome } from "@/lib/betting";
import type { EngineBook } from "@/server/confidence/types";
import {
  parsePriceBps,
  parseSharesMicros,
  tickBpsFromSize,
  SHARE_SCALE,
} from "@/server/money";
import { yesChance } from "@/lib/markets";

export function snapshotToEngineBook(snapshot: OrderBookSnapshot): EngineBook {
  const tickBps = tickBpsFromSize(snapshot.tickSize);
  const minSharesMicros = parseSharesMicros(snapshot.minOrderSize || "1", "floor");
  return {
    tokenId: snapshot.tokenId,
    tickBps,
    minSharesMicros: minSharesMicros > 0n ? minSharesMicros : SHARE_SCALE,
    negRisk: snapshot.negRisk,
    source: snapshot.source,
    hash: snapshot.hash,
    timestamp: snapshot.timestamp,
    asks: snapshot.asks
      .map((level) => ({
        priceBps: parsePriceBps(level.price, "floor"),
        sizeMicros: parseSharesMicros(level.size, "floor"),
      }))
      .filter((level) => level.priceBps > 0 && level.sizeMicros > 0n)
      .sort((a, b) => a.priceBps - b.priceBps),
    bids: snapshot.bids
      .map((level) => ({
        priceBps: parsePriceBps(level.price, "floor"),
        sizeMicros: parseSharesMicros(level.size, "floor"),
      }))
      .filter((level) => level.priceBps > 0 && level.sizeMicros > 0n)
      .sort((a, b) => b.priceBps - a.priceBps),
  };
}

export function syntheticBookFromMarket(
  market: CatalogMarket,
  outcome: Outcome,
): OrderBookSnapshot {
  const yes = yesChance(market);
  const priceBps = outcome === "YES" ? yes * 100 : Math.max(1, 100 - yes) * 100;
  const price = (priceBps / 10_000).toFixed(4);
  const tokenId =
    outcome === "YES"
      ? market.clobTokenIds?.[0] || `synthetic:${market.id}:YES`
      : market.clobTokenIds?.[1] || `synthetic:${market.id}:NO`;

  return {
    tokenId,
    conditionId: market.conditionId,
    timestamp: String(Date.now()),
    hash: `synthetic:${market.id}:${outcome}`,
    bids: [
      {
        price: (Math.max(priceBps - 100, 100) / 10_000).toFixed(4),
        size: "25000",
      },
    ],
    asks: [{ price, size: "25000" }],
    minOrderSize: "1",
    tickSize: "0.01",
    negRisk: false,
    lastTradePrice: price,
    source: "synthetic",
  };
}

export function tokenIdFor(market: CatalogMarket, outcome: Outcome) {
  return outcome === "YES" ? market.clobTokenIds?.[0] : market.clobTokenIds?.[1];
}

/**
 * Paper mode only: rebuilds the synthetic book for a catalog market's synthetic
 * token ("synthetic:<marketId>:<YES|NO>"). Returns null for real venue tokens.
 */
export function syntheticBookForToken(tokenId: string, lookup: (id: string) => CatalogMarket | null) {
  const match = /^synthetic:(.+):(YES|NO)$/.exec(tokenId);
  if (!match) return null;
  const market = lookup(match[1]!);
  return market ? syntheticBookFromMarket(market, match[2] as Outcome) : null;
}
