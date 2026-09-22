import "server-only";

import type { OrderBookSnapshot } from "@/lib/betting";
import type { EngineWalkFill } from "@/server/confidence/types";
import { formatPrice, formatShares, sharesCostMicros } from "@/server/money";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { filledShares, walkSide } from "@/server/execution/math";
import type { ExecutionSide } from "@/server/execution/types";
import {
  executionModeForToken,
  internalTradeId,
  isPoolToken,
  type ExecutionMode,
  type ExecutionRequest,
  type ExecutionSubmitResult,
  type ExecutorPort,
} from "@/server/polymarket/executor";
import { fetchClobBook, fetchClobPrice } from "@/server/polymarket/clob";
import { findLiveActivity, getLiveOrder, submitLiveOrder } from "@/server/polymarket/live";

export type VenueOrderRequest = {
  tokenId: string;
  side: ExecutionSide;
  orderType: "FAK" | "FOK" | "GTC";
  limitPriceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  tickSize: string;
  negRisk: boolean;
  book?: OrderBookSnapshot;
  /** Slice identity, so internally-filled orders get unique venue trade ids. */
  clientOrderId?: string;
};

export type VenueFill = {
  priceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  feeMicros: bigint;
  venueTradeId?: string;
  simulated: boolean;
  raw?: unknown;
};

export type VenueOrderResult = {
  mode: ExecutionMode;
  /**
   * filled/partial/rejected/failed are terminal. open = accepted by the venue and
   * may still (partially) fill; unknown = submission outcome is unknown (timeout,
   * 5xx). Neither open nor unknown may be retried or treated as filled.
   */
  status: "open" | "unknown" | "filled" | "partial" | "rejected" | "failed";
  polymarketOrderId: string | null;
  response: unknown;
  fills: VenueFill[];
  errorMessage: string | null;
  /** True only when the venue refused the order before matching (e.g. 429). */
  retryable?: boolean;
};

export type PolymarketClient = {
  mode: ExecutionMode;
  getBook(tokenId: string): Promise<OrderBookSnapshot>;
  getPrice(tokenId: string, side: ExecutionSide): Promise<string | null>;
  getOrder(orderId: string): Promise<VenueOrderResult | null>;
  submitOrder(request: VenueOrderRequest): Promise<VenueOrderResult>;
  /** Live only: this account's open orders and traded order ids on a token since a time. */
  findActivity?(tokenId: string, since: Date): Promise<{ openOrderIds: string[]; tradeOrderIds: string[] }>;
};

export function createPolymarketClient(options?: {
  mode?: ExecutionMode;
  getBook?: (tokenId: string) => Promise<OrderBookSnapshot>;
  submitOrder?: (request: VenueOrderRequest) => Promise<VenueOrderResult>;
  getOrder?: (orderId: string) => Promise<VenueOrderResult | null>;
  findActivity?: PolymarketClient["findActivity"];
}): PolymarketClient {
  const mode = options?.mode ?? (process.env.POLYMARKET_EXECUTION_MODE === "live" ? "live" : "paper");
  return {
    mode,
    getBook: options?.getBook ?? fetchClobBook,
    getPrice: (tokenId, side) => fetchClobPrice(tokenId, side),
    getOrder:
      options?.getOrder ??
      ((orderId) =>
        mode === "live" && !isInternalOrderId(orderId) ? getLiveOrder(orderId) : Promise.resolve(null)),
    findActivity: options?.findActivity ?? (mode === "live" ? findLiveActivity : undefined),
    submitOrder:
      options?.submitOrder ??
      ((request) =>
        mode === "live" && !isInternalToken(request.tokenId)
          ? submitLiveOrder(request)
          : Promise.resolve(paperFill(request, mode))),
  };
}

export function clientFromExecutor(
  executor: ExecutorPort,
  getBook: (tokenId: string) => Promise<OrderBookSnapshot>,
): PolymarketClient {
  return {
    mode: executor.mode,
    getBook,
    getPrice: async () => null,
    async getOrder(orderId) {
      if (isInternalOrderId(orderId)) return null;
      const result = await executor.getOrder(orderId);
      return result ? toVenue(result) : null;
    },
    async submitOrder(request) {
      // A pool token has no venue listing, so it must never be submitted.
      if (isInternalToken(request.tokenId)) return paperFill(request, executor.mode);
      const mapped: ExecutionRequest = {
        tokenId: request.tokenId,
        side: request.side,
        orderType: request.orderType,
        limitPriceBps: request.limitPriceBps,
        sharesMicros: request.sharesMicros,
        notionalMicros: request.notionalMicros,
        tickSize: request.tickSize,
        negRisk: request.negRisk,
        book: request.book,
        clientOrderId: request.clientOrderId,
      };
      return toVenue(await executor.submit(mapped));
    },
  };
}

function toVenue(result: ExecutionSubmitResult): VenueOrderResult {
  return {
    mode: result.mode,
    status: result.status,
    polymarketOrderId: result.polymarketOrderId,
    response: result.response,
    fills: result.fills.map((fill) => ({
      priceBps: fill.priceBps,
      sharesMicros: fill.sharesMicros,
      notionalMicros: fill.notionalMicros,
      feeMicros: 0n,
      venueTradeId: fill.venueTradeId,
      simulated: fill.simulated,
      raw: fill.raw,
    })),
    errorMessage: result.errorMessage,
  };
}

/**
 * A Split pool and a demo market quote a synthetic token ("synthetic:<marketId>:
 * <YES|NO>") that exists only in this database. The pool itself is the counterparty
 * and its book IS the LMSR curve, so filling against that book is the real trade,
 * not a simulation of one.
 *
 * Routing on execution mode alone would hand such a token to the CLOB the moment
 * POLYMARKET_EXECUTION_MODE=live, where it matches nothing. The token, not the
 * mode, decides the venue.
 */
function isInternalToken(tokenId: string) {
  return isPoolToken(tokenId);
}

/** Orders filled internally carry a paper id; the venue has never heard of them. */
function isInternalOrderId(orderId: string) {
  return orderId.startsWith("paper_");
}

function paperFill(request: VenueOrderRequest, venueMode: ExecutionMode = "paper"): VenueOrderResult {
  const settledMode = executionModeForToken(request.tokenId, venueMode);
  const lot = defaultExecutionEngineConfig.shareLotMicros;
  const fills: EngineWalkFill[] = request.book
    ? walkSide(request.book, request.side, request.limitPriceBps, request.sharesMicros, lot)
    : [];
  const mapped: VenueFill[] = fills.map((fill, index) => ({
    ...fill,
    feeMicros: 0n,
    venueTradeId: internalTradeId(settledMode === "pool" ? "pool" : "paper", request.clientOrderId, index),
    // A pool fill is not simulated: the liquidity fund really took the other side.
    simulated: settledMode !== "pool",
    raw: fill,
  }));
  const filled = filledShares(mapped);
  return {
    mode: settledMode,
    status: filled >= request.sharesMicros ? "filled" : filled > 0n ? "partial" : "rejected",
    polymarketOrderId: `paper_${request.tokenId}_${Date.now()}`,
    response: {
      venue: "polymarket",
      mode: "paper",
      tokenId: request.tokenId,
      side: request.side,
      orderType: request.orderType,
      price: formatPrice(request.limitPriceBps),
      size: formatShares(request.sharesMicros),
    },
    fills: mapped,
    errorMessage: filled > 0n ? null : "Paper book walk produced no fills.",
  };
}

export function notionalFromShares(sharesMicros: bigint, priceBps: number) {
  return sharesCostMicros(sharesMicros, priceBps);
}
