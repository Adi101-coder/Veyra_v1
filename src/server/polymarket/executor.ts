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
  mode: "paper" | "live";
  status: VenueOrderResult["status"];
  polymarketOrderId: string | null;
  response: unknown;
  fills: ExecutionFill[];
  errorMessage: string | null;
  retryable?: boolean;
};

export type ExecutorPort = {
  mode: "paper" | "live";
  submit(request: ExecutionRequest): Promise<ExecutionSubmitResult>;
  getOrder(orderId: string): Promise<ExecutionSubmitResult | null>;
};

export function paperExecutor(): ExecutorPort {
  return {
    mode: "paper",
    async submit(request) {
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
        venueTradeId: `paper-${index + 1}`,
        simulated: true,
        raw: fill,
      }));
      const filled = filledShares(fills);
      return {
        mode: "paper",
        status: filled >= request.sharesMicros ? "filled" : fills.length ? "partial" : "rejected",
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
        fills,
        errorMessage: filled > 0n ? null : "Paper book walk produced no fills.",
      };
    },
    async getOrder() {
      // Paper orders settle synchronously in submit(); there is no venue order to query.
      return null;
    },
  };
}

export function executionMode(env: NodeJS.ProcessEnv = process.env): "paper" | "live" {
  const raw = (env.POLYMARKET_EXECUTION_MODE ?? "paper").toLowerCase();
  return raw === "live" ? "live" : "paper";
}

export function createExecutor(env: NodeJS.ProcessEnv = process.env): ExecutorPort {
  if (executionMode(env) !== "live") return paperExecutor();
  return liveExecutor();
}

function liveExecutor(): ExecutorPort {
  return {
    mode: "live",
    submit: (request) => submitLiveOrder(request),
    getOrder: (orderId) => getLiveOrder(orderId),
  };
}
