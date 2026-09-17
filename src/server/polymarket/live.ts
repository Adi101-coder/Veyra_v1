import "server-only";

import { BettingError } from "@/server/errors";
import { formatPrice, formatShares, formatUsd, parseDecimalToScale } from "@/server/money";
import type { VenueFill, VenueOrderRequest, VenueOrderResult } from "@/server/polymarket/client";

/**
 * Live Polymarket CLOB access through the official @polymarket/clob-client-v2 SDK.
 * Fills are only ever derived from what the venue reports (POST /order matched
 * amounts or GET /data/trades), never from our own order-book walk.
 */

const TICK_SIZES = ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"] as const;

type SdkClient = InstanceType<typeof import("@polymarket/clob-client-v2").ClobClient>;

let cached: Promise<SdkClient> | null = null;

async function sdkClient(): Promise<SdkClient> {
  if (!cached) {
    cached = buildSdkClient().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

async function buildSdkClient(): Promise<SdkClient> {
  const { Chain, ClobClient } = await import("@polymarket/clob-client-v2");
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { polygon, polygonAmoy } = await import("viem/chains");

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) {
    throw new BettingError("LIVE_NOT_CONFIGURED", "Live execution is not configured.", 503);
  }
  const privateKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const amoy = process.env.POLYMARKET_CHAIN_ID === "80002";
  const walletClient = createWalletClient({
    account,
    chain: amoy ? polygonAmoy : polygon,
    transport: http(process.env.POLYGON_RPC_URL || undefined),
  });

  const host = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";
  const chain = amoy ? Chain.AMOY : Chain.POLYGON;
  const signatureType = Number.parseInt(process.env.POLYMARKET_SIGNATURE_TYPE ?? "0", 10);
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || undefined;
  if (signatureType !== 0 && !funderAddress) {
    throw new BettingError(
      "LIVE_NOT_CONFIGURED",
      "POLYMARKET_FUNDER_ADDRESS is required for proxy/safe signature types.",
      503,
    );
  }

  const envCreds = {
    key: process.env.POLYMARKET_API_KEY ?? "",
    secret: process.env.POLYMARKET_API_SECRET ?? "",
    passphrase: process.env.POLYMARKET_API_PASSPHRASE ?? "",
  };
  const creds =
    envCreds.key && envCreds.secret && envCreds.passphrase
      ? envCreds
      : await new ClobClient({ host, chain, signer: walletClient }).createOrDeriveApiKey();

  return new ClobClient({
    host,
    chain,
    signer: walletClient,
    creds,
    signatureType: Number.isFinite(signatureType) ? signatureType : 0,
    funderAddress,
    throwOnError: true,
  });
}

function micros(value: unknown) {
  if (value == null || value === "") return 0n;
  try {
    return parseDecimalToScale(String(value), 6, "floor");
  } catch {
    return 0n;
  }
}

function priceBpsOf(value: unknown) {
  if (value == null || value === "") return 0;
  try {
    return Number(parseDecimalToScale(String(value), 4, "floor"));
  } catch {
    return 0;
  }
}

function vwap(notionalMicros: bigint, sharesMicros: bigint) {
  return sharesMicros > 0n ? Number((notionalMicros * 10_000n) / sharesMicros) : 0;
}

function errorStatus(error: unknown): number | null {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = candidate?.status ?? candidate?.response?.status;
  return typeof status === "number" ? status : null;
}

type PostOrderResponse = {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  makingAmount?: string;
  takingAmount?: string;
  tradeIDs?: string[];
};

/**
 * Maps a POST /order response into fills. For BUY the maker gives USDC
 * (makingAmount) and takes shares (takingAmount); for SELL it is reversed.
 */
export function mapPostOrderResponse(
  request: Pick<VenueOrderRequest, "side" | "sharesMicros" | "orderType">,
  response: PostOrderResponse,
): VenueOrderResult {
  const orderId = response.orderID || null;
  if (response.success === false || response.errorMsg) {
    return {
      mode: "live",
      // An order id with an error means the venue saw it; reconcile instead of assuming.
      status: orderId ? "unknown" : "rejected",
      polymarketOrderId: orderId,
      response,
      fills: [],
      errorMessage: response.errorMsg || "Polymarket rejected the order",
    };
  }
  const making = micros(response.makingAmount);
  const taking = micros(response.takingAmount);
  const shares = request.side === "BUY" ? taking : making;
  const notional = request.side === "BUY" ? making : taking;
  const status = (response.status ?? "").toLowerCase();

  const fills: VenueFill[] =
    status === "matched" && shares > 0n
      ? [
          {
            priceBps: vwap(notional, shares),
            sharesMicros: shares,
            notionalMicros: notional,
            feeMicros: 0n,
            venueTradeId: response.tradeIDs?.length ? response.tradeIDs.join(",") : `order:${orderId}`,
            simulated: false,
            raw: { makingAmount: response.makingAmount, takingAmount: response.takingAmount },
          },
        ]
      : [];

  if (status === "matched") {
    return {
      mode: "live",
      status: shares >= request.sharesMicros ? "filled" : shares > 0n ? "partial" : "failed",
      polymarketOrderId: orderId,
      response,
      fills,
      errorMessage: shares > 0n ? null : "Order matched with no reported size",
    };
  }
  if (status === "unmatched" && request.orderType !== "GTC") {
    // FAK/FOK that found no liquidity is killed by the venue: terminal, zero fills.
    return {
      mode: "live",
      status: "rejected",
      polymarketOrderId: orderId,
      response,
      fills: [],
      errorMessage: "No liquidity at the limit price; order was killed.",
    };
  }
  // live (resting), delayed, or an unknown status: accepted but not yet known to be filled.
  return {
    mode: "live",
    status: orderId ? "open" : "failed",
    polymarketOrderId: orderId,
    response,
    fills: [],
    errorMessage: orderId ? null : "Polymarket did not return an order id",
  };
}

export async function submitLiveOrder(request: VenueOrderRequest): Promise<VenueOrderResult> {
  const { OrderType, Side } = await import("@polymarket/clob-client-v2");
  const client = await sdkClient();
  const tickSize = TICK_SIZES.includes(request.tickSize as (typeof TICK_SIZES)[number])
    ? (request.tickSize as (typeof TICK_SIZES)[number])
    : null;
  if (!tickSize) {
    throw new BettingError("INVALID_TICK_SIZE", `Unsupported tick size ${request.tickSize}.`, 422);
  }
  const options = { tickSize, negRisk: request.negRisk };
  const price = Number(formatPrice(request.limitPriceBps));
  const size = Number(formatShares(request.sharesMicros, 2));
  const amount = Number(formatUsd(request.notionalMicros, 2));
  const side = request.side === "SELL" ? Side.SELL : Side.BUY;

  try {
    const response =
      request.orderType === "GTC"
        ? await client.createAndPostOrder({ tokenID: request.tokenId, price, size, side }, options, OrderType.GTC)
        : await client.createAndPostMarketOrder(
            {
              tokenID: request.tokenId,
              price,
              // Market BUY is denominated in USDC, market SELL in shares.
              amount: request.side === "SELL" ? size : amount,
              side,
              orderType: request.orderType === "FOK" ? OrderType.FOK : OrderType.FAK,
            },
            options,
            request.orderType === "FOK" ? OrderType.FOK : OrderType.FAK,
          );
    return mapPostOrderResponse(request, response as PostOrderResponse);
  } catch (error) {
    const status = errorStatus(error);
    const message = error instanceof Error ? error.message : "Live Polymarket submission failed";
    // 429/503 are refused before matching and are safe to retry. Anything else
    // (timeouts, 5xx, network) may have reached the matcher: never blind-retry.
    const retryable = status === 429 || status === 503 || status === 425;
    return {
      mode: "live",
      status: retryable || (status != null && status >= 400 && status < 500) ? "rejected" : "unknown",
      polymarketOrderId: null,
      response: { error: message, status },
      fills: [],
      errorMessage: message,
      retryable,
    };
  }
}

type OpenOrderLike = {
  id?: string;
  status?: string;
  original_size?: string;
  size_matched?: string;
  price?: string;
  associate_trades?: string[];
};

type TradeLike = {
  id: string;
  taker_order_id?: string;
  size?: string;
  price?: string;
  status?: string;
  fee_rate_bps?: string;
  maker_orders?: { order_id?: string; matched_amount?: string; price?: string; fee_rate_bps?: string }[];
};

/** Polymarket taker fee: shares x feeRate x p x (1 - p), charged only to the taker. */
export function takerFeeMicros(sharesMicros: bigint, priceBps: number, feeRateBps: string | undefined) {
  const rate = BigInt(Number.parseInt(feeRateBps ?? "0", 10) || 0);
  if (rate <= 0n || priceBps <= 0 || priceBps >= 10_000) return 0n;
  const p = BigInt(priceBps);
  return (sharesMicros * rate * p * (10_000n - p)) / (10_000n * 10_000n * 10_000n);
}

/** Builds our fills for one order from the venue trade list (taker or maker side). */
export function fillsFromTrades(orderId: string, trades: TradeLike[]): VenueFill[] {
  const fills: VenueFill[] = [];
  for (const trade of trades) {
    // Docs list TRADE_STATUS_FAILED; the SDK types it as a plain string. Accept both.
    if ((trade.status ?? "").toUpperCase().endsWith("FAILED")) continue;
    if (trade.taker_order_id === orderId) {
      const shares = micros(trade.size);
      const priceBps = priceBpsOf(trade.price);
      if (shares <= 0n) continue;
      fills.push({
        priceBps,
        sharesMicros: shares,
        notionalMicros: (shares * BigInt(priceBps)) / 10_000n,
        feeMicros: takerFeeMicros(shares, priceBps, trade.fee_rate_bps),
        venueTradeId: trade.id,
        simulated: false,
        raw: trade,
      });
      continue;
    }
    for (const maker of trade.maker_orders ?? []) {
      if (maker.order_id !== orderId) continue;
      const shares = micros(maker.matched_amount);
      const priceBps = priceBpsOf(maker.price);
      if (shares <= 0n) continue;
      fills.push({
        priceBps,
        sharesMicros: shares,
        notionalMicros: (shares * BigInt(priceBps)) / 10_000n,
        feeMicros: 0n,
        venueTradeId: `${trade.id}:${orderId}`,
        simulated: false,
        raw: trade,
      });
    }
  }
  return fills;
}

export function mapOpenOrder(order: OpenOrderLike, orderId: string, fills: VenueFill[]): VenueOrderResult {
  const original = micros(order.original_size);
  const matched = micros(order.size_matched);
  const venueStatus = (order.status ?? "").toUpperCase();
  // Documented statuses: LIVE, MATCHED, CANCELED, CANCELED_MARKET_RESOLVED, INVALID.
  const terminal =
    venueStatus === "MATCHED" ||
    venueStatus.startsWith("CANCEL") ||
    venueStatus === "INVALID" ||
    venueStatus === "EXPIRED";
  const filled = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  // Trust trades for size; size_matched guards against missing trade pages.
  const complete = filled >= matched;
  const status: VenueOrderResult["status"] = !terminal || !complete
    ? "open"
    : original > 0n && filled >= original
      ? "filled"
      : filled > 0n
        ? "partial"
        : "rejected";
  return {
    mode: "live",
    status,
    polymarketOrderId: order.id ?? orderId,
    response: order,
    fills,
    errorMessage: status === "rejected" ? `Order ${venueStatus.toLowerCase() || "closed"} without fills` : null,
  };
}

export async function getLiveOrder(orderId: string): Promise<VenueOrderResult | null> {
  const client = await sdkClient();
  const order = (await client.getOrder(orderId)) as OpenOrderLike | null;
  if (!order || !order.id) return null;
  const tradeIds = [...new Set(order.associate_trades ?? [])];
  const pages = await Promise.all(tradeIds.map((id) => client.getTrades({ id }, true)));
  return mapOpenOrder(order, orderId, fillsFromTrades(orderId, pages.flat() as TradeLike[]));
}
