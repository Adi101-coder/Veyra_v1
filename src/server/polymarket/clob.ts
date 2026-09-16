import "server-only";

import type { OrderBookSnapshot } from "@/lib/betting";
import { BettingError } from "@/server/errors";

const CLOB = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";
const USER_AGENT = "VEYRAMarkets/0.1 (confidence-betting)";

type ClobLevel = { price?: string; size?: string };
type ClobBook = {
  market?: string;
  asset_id?: string;
  timestamp?: string;
  hash?: string;
  bids?: ClobLevel[];
  asks?: ClobLevel[];
  min_order_size?: string;
  tick_size?: string;
  neg_risk?: boolean;
  last_trade_price?: string;
  error?: string;
};

type ClobOrder = {
  id?: string;
  status?: string;
  size_matched?: string;
  original_size?: string;
  price?: string;
  associate_trades?: string[];
  error?: string;
};

async function clobGet<T>(path: string, auth?: Record<string, string>): Promise<T> {
  const response = await fetch(`${CLOB}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
      ...auth,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new BettingError(
      "POLYMARKET_CLOB",
      json.error || `Polymarket CLOB ${response.status}`,
      response.status === 404 ? 404 : 502,
    );
  }
  return json;
}

function levels(rows: ClobLevel[] | undefined) {
  return (rows ?? [])
    .map((row) => ({ price: String(row.price ?? ""), size: String(row.size ?? "") }))
    .filter((row) => row.price && row.size);
}

export async function fetchClobBook(tokenId: string): Promise<OrderBookSnapshot> {
  const raw = await clobGet<ClobBook>(`/book?token_id=${encodeURIComponent(tokenId)}`);
  return {
    tokenId: raw.asset_id || tokenId,
    conditionId: raw.market,
    timestamp: raw.timestamp,
    hash: raw.hash,
    bids: levels(raw.bids),
    asks: levels(raw.asks),
    minOrderSize: raw.min_order_size || "1",
    tickSize: raw.tick_size || "0.01",
    negRisk: raw.neg_risk === true,
    lastTradePrice: raw.last_trade_price,
    source: "polymarket",
  };
}

export async function fetchClobPrice(tokenId: string, side: "BUY" | "SELL") {
  const raw = await clobGet<{ price?: string }>(
    `/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`,
  );
  return raw.price ?? null;
}

export async function fetchClobOrder(orderId: string) {
  return clobGet<ClobOrder>(`/order/${encodeURIComponent(orderId)}`);
}

export function clobHost() {
  return CLOB;
}
