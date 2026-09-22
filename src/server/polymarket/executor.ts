import "server-only";

import type { OrderBookSnapshot } from "@/lib/betting";
import type { EngineResult, EngineWalkFill } from "@/server/confidence/types";
import { formatPrice, formatShares } from "@/server/money";
import type { ConfidenceEngineConfig } from "@/server/confidence/config";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { filledShares, walkSide } from "@/server/execution/math";
import type { VenueOrderResult } from "@/server/polymarket/client";
import { getLiveOrder, submitLiveOrder } from "@/server/polymarket/live";

export type ExecutionRequest = {
  tokenId: string;
  side: "BUY" | "SELL";
  orderType: ConfidenceEngineConfig["orderType"];
  limitPriceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  tickSize: string;
  negRisk: boolean;
  engine?: EngineResult;
  adjustmentFills?: EngineWalkFill[];
  book?: OrderBookSnapshot;
  /**
   * The slice row this submit belongs to. Internally-filled orders have no venue
   * trade ids of their own, so they derive theirs from this; without it every
   * slice of one execution names its first fill the same thing and the unique
   * index on (executionId, venueTradeId) silently drops all but one.
   */
  clientOrderId?: string;
};

export type ExecutionFill = {
  priceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  venueTradeId?: string;
  simulated: boolean;
  raw?: unknown;
};

export type ExecutionSubmitResult = {
  mode: ExecutionMode;
  status: VenueOrderResult["status"];
  polymarketOrderId: string | null;
  response: unknown;
  fills: ExecutionFill[];
  errorMessage: string | null;
  retryable?: boolean;
};

export type ExecutorPort = {
  mode: ExecutionMode;
  submit(request: ExecutionRequest): Promise<ExecutionSubmitResult>;
  getOrder(orderId: string): Promise<ExecutionSubmitResult | null>;
};

/**
 * A trade id for a fill that no venue produced. Unique per slice, because slices of
 * one execution all write into the same (executionId, venueTradeId) unique index.
 */
export function internalTradeId(label: string, clientOrderId: string | undefined, index: number) {
  return clientOrderId ? `${label}-${clientOrderId}-${index + 1}` : `${label}-${index + 1}`;
}

export function paperExecutor(venueMode: ExecutionMode = "paper"): ExecutorPort {
  return {
    mode: venueMode,
    async submit(request) {
      // A pool order settles internally whatever the deployment mode is, so the
      // mode is decided per token rather than per deployment.
      const settledMode = executionModeForToken(request.tokenId, venueMode);
      const simulated = settledMode !== "pool";
      const label = simulated ? "paper" : "pool";
      const source =
        request.adjustmentFills ??
        request.engine?.fills ??
        (request.book
          ? walkSide(
              request.book,
              request.side,
              request.limitPriceBps,
              request.sharesMicros,
              defaultExecutionEngineConfig.shareLotMicros,
            )
          : []);
      const fills = source.map((fill, index) => ({
        priceBps: fill.priceBps,
        sharesMicros: fill.sharesMicros,
        notionalMicros: fill.notionalMicros,
        venueTradeId: internalTradeId(label, request.clientOrderId, index),
        simulated,
        raw: fill,
      }));
      const filled = filledShares(fills);
      return {
        mode: settledMode,
        status: filled >= request.sharesMicros ? "filled" : fills.length ? "partial" : "rejected",
        polymarketOrderId: `paper_${request.tokenId}_${Date.now()}`,
        response: {
          venue: "polymarket",
          mode: settledMode,
          tokenId: request.tokenId,
          side: request.side,
          orderType: request.orderType,
          price: formatPrice(request.limitPriceBps),
          size: formatShares(request.sharesMicros),
        },
        fills,
        errorMessage:
          filled > 0n
            ? null
            : simulated
              ? "Paper book walk produced no fills."
              : "The pool's curve produced no fills at this limit.",
      };
    },
    async getOrder() {
      // Settled synchronously in submit(); there is no venue order to query.
      return null;
    },
  };
}

/**
 * How an order settles.
 *
 * paper — simulated; no real money moves.
 * live  — routed to Polymarket; real money at the venue.
 * pool  — filled against a Split pool's LMSR curve; REAL money, but the liquidity
 *         fund is the counterparty and nothing reaches a venue. A pool is not a
 *         simulation: the fund genuinely wins or loses on the other side.
 *
 * Treating a pool as "paper" is why pool trades moved no custodial cash, and
 * treating its book as a demo made pools untradable the moment live mode was on.
 */
export type ExecutionMode = "paper" | "live" | "pool";

/** True when a token is a Split pool's, which is settled internally, never at a venue. */
export function isPoolToken(tokenId: string) {
  return tokenId.startsWith("synthetic:");
}

/**
 * The mode a specific order settles in. A pool order is real money only when the
 * deployment itself is live; in paper mode everything stays simulated.
 */
export function executionModeForToken(tokenId: string, venueMode: ExecutionMode): ExecutionMode {
  if (!isPoolToken(tokenId)) return venueMode;
  return venueMode === "live" ? "pool" : "paper";
}

export function executionMode(env: NodeJS.ProcessEnv = process.env): "paper" | "live" {
  const raw = (env.POLYMARKET_EXECUTION_MODE ?? "paper").toLowerCase();
  return raw === "live" ? "live" : "paper";
}

export function createExecutor(env: NodeJS.ProcessEnv = process.env): ExecutorPort {
  if (executionMode(env) !== "live") return paperExecutor();
  // Live deployment: venue orders go to Polymarket, pool orders are filled against
  // the pool's own curve. Routing on deployment mode alone sent pool tokens — which
  // exist only in Postgres — to the CLOB, where they match nothing.
  const venue = liveExecutor();
  const internal = paperExecutor("live");
  return {
    mode: "live",
    submit: (request) =>
      isPoolToken(request.tokenId) ? internal.submit(request) : venue.submit(request),
    getOrder: (orderId) =>
      orderId.startsWith("paper_") ? internal.getOrder(orderId) : venue.getOrder(orderId),
  };
}

function liveExecutor(): ExecutorPort {
  return {
    mode: "live",
    submit: (request) => submitLiveOrder(request),
    getOrder: (orderId) => getLiveOrder(orderId),
  };
}
