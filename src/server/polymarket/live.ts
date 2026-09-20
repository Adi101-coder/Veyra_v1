import "server-only";

import { pinPolymarketDns } from "@/lib/polymarket-dns";
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
let resolvedLiveFunder: string | undefined;

async function sdkClient(): Promise<SdkClient> {
  if (!cached) {
    cached = buildSdkClient().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

function completeCreds(creds: { key?: string; secret?: string; passphrase?: string } | null | undefined) {
  const key = creds?.key?.trim() ?? "";
  const secret = creds?.secret?.trim() ?? "";
  const passphrase = creds?.passphrase?.trim() ?? "";
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase };
}

async function buildSdkClient(): Promise<SdkClient> {
  pinPolymarketDns();
  const { Chain, ClobClient, SignatureTypeV2 } = await import("@polymarket/clob-client-v2");
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
  let signatureType = Number.parseInt(process.env.POLYMARKET_SIGNATURE_TYPE ?? "0", 10);
  let funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || undefined;
  if (signatureType === 1 || signatureType === 2) {
    if (!funderAddress) {
      throw new BettingError(
        "LIVE_NOT_CONFIGURED",
        "POLYMARKET_FUNDER_ADDRESS is required for proxy/safe signature types.",
        503,
      );
    }
    resolvedLiveFunder = funderAddress;
  } else {
    // Production CLOB rejects EOA makers. Type 0/3 go through the deposit wallet.
    const { ensureDepositWalletTrading } = await import("@/server/polymarket/deposit-wallet-setup");
    const ensured = await ensureDepositWalletTrading();
    signatureType = SignatureTypeV2.POLY_1271;
    funderAddress = ensured.funder;
    resolvedLiveFunder = ensured.funder;
  }

  const envCreds = completeCreds({
    key: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_API_SECRET,
    passphrase: process.env.POLYMARKET_API_PASSPHRASE,
  });
    const unsigned = new ClobClient({
    host,
    chain,
    signer: walletClient,
    signatureType,
    funderAddress,
  });
  let creds = envCreds;
  if (!creds) {
    try {
      creds = completeCreds(await unsigned.createOrDeriveApiKey());
    } catch {
      creds = null;
    }
    if (!creds) creds = completeCreds(await unsigned.deriveApiKey());
  }
  if (!creds) {
    throw new BettingError(
      "LIVE_NOT_CONFIGURED",
      "Polymarket did not return API credentials. Set POLYMARKET_API_KEY/SECRET/PASSPHRASE or retry when the CLOB is reachable.",
      503,
    );
  }
  process.env.POLYMARKET_API_KEY = creds.key;
  process.env.POLYMARKET_API_SECRET = creds.secret;
  process.env.POLYMARKET_API_PASSPHRASE = creds.passphrase;

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

function venueErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  const candidate = error as {
    data?: { error?: string; errorMsg?: string };
    response?: { data?: { error?: string; errorMsg?: string } };
  };
  return (
    candidate?.response?.data?.errorMsg ||
    candidate?.response?.data?.error ||
    candidate?.data?.errorMsg ||
    candidate?.data?.error ||
    "Live Polymarket submission failed"
  );
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

export class VenueTimeoutError extends Error {
  constructor(ms: number) {
    super(`Polymarket did not answer within ${ms}ms; order outcome unknown.`);
    this.name = "VenueTimeoutError";
  }
}

/** Resolves with the promise or rejects after `ms`. The underlying request may still land. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new VenueTimeoutError(ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Serializes order posts per process with a minimum spacing, keeping well under
 * Polymarket's per-account order token bucket (standard tier: 40/s, burst 60).
 */
let lastPost = 0;
let postChain: Promise<void> = Promise.resolve();
export function paceOrderPost(minSpacingMs = Number.parseInt(process.env.POLYMARKET_ORDER_SPACING_MS ?? "50", 10)) {
  const next = postChain.then(async () => {
    const wait = lastPost + minSpacingMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastPost = Date.now();
  });
  postChain = next.catch(() => undefined);
  return next;
}

export async function submitLiveOrder(request: VenueOrderRequest): Promise<VenueOrderResult> {
  const { AssetType, OrderType, Side } = await import("@polymarket/clob-client-v2");
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

  const timeoutMs = Number.parseInt(process.env.VEYRA_VENUE_TIMEOUT_MS ?? "10000", 10);
  try {
    try {
      if (request.side === "SELL") {
        await client.updateBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: request.tokenId });
      } else {
        await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      }
    } catch {
      // Refresh is best-effort; a stale CLOB cache still fails at post.
    }
    await paceOrderPost();
    // GTC is a limit order; FOK/FAK are market orders and take a different SDK
    // entry point with a different payload. Posting a market order through
    // createAndPostOrder is not just a type mismatch — the payload is wrong.
    const response = await withTimeout(
      request.orderType === "GTC"
        ? client.createAndPostOrder({ tokenID: request.tokenId, price, size, side }, options, OrderType.GTC)
        : client.createAndPostMarketOrder(
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
          ),
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
    );
    return mapPostOrderResponse(request, response as PostOrderResponse);
  } catch (error) {
    const status = errorStatus(error);
    const message = venueErrorMessage(error);
    if (error instanceof VenueTimeoutError) {
      return { mode: "live", status: "unknown", polymarketOrderId: null, response: { error: message }, fills: [], errorMessage: message };
    }
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

/**
 * Venue activity for one token since a time: our open order ids and the order ids
 * behind our trades (L2-scoped to this account). Used to decide whether an order
 * whose submission outcome is unknown and has no id could exist on the venue.
 */
export async function findLiveActivity(tokenId: string, since: Date) {
  const client = await sdkClient();
  const open = (await client.getOpenOrders({ asset_id: tokenId })) as OpenOrderLike[];
  const trades = (await client.getTrades({ asset_id: tokenId, after: String(Math.floor(since.getTime() / 1000)) })) as TradeLike[];
  const tradeOrderIds = new Set<string>();
  for (const trade of trades) {
    if (trade.taker_order_id) tradeOrderIds.add(trade.taker_order_id);
    for (const maker of trade.maker_orders ?? []) if (maker.order_id) tradeOrderIds.add(maker.order_id);
  }
  return {
    openOrderIds: open.map((order) => order.id).filter((id): id is string => Boolean(id)),
    tradeOrderIds: [...tradeOrderIds],
  };
}

/**
 * Read-only omnibus inventory from Polymarket (see src/server/inventory). Balances
 * come from GET /balance-allowance, refreshed first because the server caches them;
 * the spec defines them as fixed-math strings with 6 decimals. Trades come from
 * GET /data/trades (L2-scoped to this account), converted to THIS account's side:
 * taker trades use the top-level fields; maker trades use only our maker_orders
 * entries (matched by funder address or API-key owner) with their own asset/side.
 */
export async function createLiveInventoryVenue() {
  const { AssetType } = await import("@polymarket/clob-client-v2");
  const client = await sdkClient();
  const signerAddress = (client.signer as { account?: { address?: string } } | undefined)?.account?.address ?? "";
  // Balances and maker fills belong to the funder (proxy/safe) for signature types 1-3, else the signer.
  const funder = (resolvedLiveFunder || process.env.POLYMARKET_FUNDER_ADDRESS || signerAddress).toLowerCase();
  const owner = (client.creds?.key ?? "").toLowerCase();
  const baseUnits = (raw: string, what: string) => {
    if (!/^\d+$/.test(raw)) throw new Error(`Unexpected ${what} balance format from Polymarket.`);
    return BigInt(raw);
  };
  return {
    network: process.env.POLYMARKET_CHAIN_ID === "80002" ? "polygon-amoy" : "polygon",
    async getCollateralBalance() {
      await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      const response = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      return baseUnits(response.balance, "collateral");
    },
    async getTokenBalance(tokenId: string) {
      await client.updateBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: tokenId });
      const response = await client.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: tokenId });
      return baseUnits(response.balance, "conditional token");
    },
    async listTrades(since: Date | null) {
      const trades = (await client.getTrades(since ? { after: String(Math.floor(since.getTime() / 1000)) } : undefined)) as unknown as RawTrade[];
      return tradesForAccount(trades, { funder, owner });
    },
  };
}

type RawTrade = TradeLike & {
  asset_id?: string;
  side?: string;
  trader_side?: string;
  match_time?: string;
  maker_orders?: (NonNullable<TradeLike["maker_orders"]>[number] & { asset_id?: string; side?: string; maker_address?: string; owner?: string })[];
};

/** Exported for tests: this account's executions inside raw /data/trades rows. */
export function tradesForAccount(trades: RawTrade[], account: { funder: string; owner: string }) {
  const out = new Map<string, { tradeId: string; orderId: string; tokenId: string; side: "BUY" | "SELL"; sharesMicros: bigint; priceBps: number; status: string; matchedAt: Date }>();
  const add = (row: { tradeId: string; orderId: string; tokenId: string; side: "BUY" | "SELL"; sharesMicros: bigint; priceBps: number; status: string; matchedAt: Date }) => {
    if (row.sharesMicros <= 0n || !row.tokenId) return;
    const key = `${row.tradeId}|${row.tokenId}|${row.side}`;
    const existing = out.get(key);
    if (existing) existing.sharesMicros += row.sharesMicros;
    else out.set(key, { ...row });
  };
  for (const trade of trades) {
    const matchedAt = new Date(Number(trade.match_time ?? 0) * (String(trade.match_time ?? "").length > 11 ? 1 : 1000));
    const status = trade.status ?? "";
    if ((trade.trader_side ?? "").toUpperCase() === "TAKER") {
      add({
        tradeId: trade.id,
        orderId: trade.taker_order_id ?? "",
        tokenId: trade.asset_id ?? "",
        side: (trade.side ?? "").toUpperCase() === "SELL" ? "SELL" : "BUY",
        sharesMicros: micros(trade.size),
        priceBps: priceBpsOf(trade.price),
        status,
        matchedAt,
      });
      continue;
    }
    for (const maker of trade.maker_orders ?? []) {
      const ours =
        (account.funder && (maker.maker_address ?? "").toLowerCase() === account.funder) ||
        (account.owner && (maker.owner ?? "").toLowerCase() === account.owner);
      if (!ours) continue;
      const tokenId = maker.asset_id ?? trade.asset_id ?? "";
      const topSide = (trade.side ?? "").toUpperCase() === "SELL" ? "SELL" : "BUY";
      // Without an explicit maker side: same asset → opposite side; different asset
      // (mint/merge match) → same side.
      const side = maker.side
        ? maker.side.toUpperCase() === "SELL" ? "SELL" : "BUY"
        : tokenId === trade.asset_id ? (topSide === "BUY" ? "SELL" : "BUY") : topSide;
      add({ tradeId: trade.id, orderId: maker.order_id ?? "", tokenId, side, sharesMicros: micros(maker.matched_amount), priceBps: priceBpsOf(maker.price), status, matchedAt });
    }
  }
  return [...out.values()];
}
