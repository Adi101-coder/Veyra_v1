import "server-only";

import type { OrderBookSnapshot } from "@/lib/betting";
import type { EngineResult, EngineWalkFill } from "@/server/confidence/types";
import { BettingError } from "@/server/errors";
import { formatPrice, formatShares, formatUsd } from "@/server/money";
import type { ConfidenceEngineConfig } from "@/server/confidence/config";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { filledShares, walkSide } from "@/server/execution/math";

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
  status: "submitted" | "open" | "filled" | "partial" | "rejected" | "failed";
  polymarketOrderId: string | null;
  response: unknown;
  fills: ExecutionFill[];
  errorMessage: string | null;
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
        status: filled >= request.sharesMicros ? "filled" : fills.length ? "partial" : "failed",
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
    async getOrder(orderId) {
      return {
        mode: "paper",
        status: "filled",
        polymarketOrderId: orderId,
        response: { id: orderId, status: "MATCHED" },
        fills: [],
        errorMessage: null,
      };
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
    async submit(request) {
      return submitLiveOrder(request);
    },
    async getOrder(orderId) {
      const { fetchClobOrder } = await import("@/server/polymarket/clob");
      const order = await fetchClobOrder(orderId);
      const matched = Number.parseFloat(order.size_matched || "0");
      const original = Number.parseFloat(order.original_size || "0");
      const status =
        order.status === "MATCHED" || (original > 0 && matched >= original)
          ? "filled"
          : matched > 0
            ? "partial"
            : order.status === "CANCELLED" || order.status === "EXPIRED"
              ? "rejected"
              : "open";
      return {
        mode: "live",
        status,
        polymarketOrderId: order.id ?? orderId,
        response: order,
        fills: [],
        errorMessage: order.error ?? null,
      };
    },
  };
}

const TICK_SIZES = ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"] as const;

async function submitLiveOrder(request: ExecutionRequest): Promise<ExecutionSubmitResult> {
  try {
    const { Chain, ClobClient, OrderType, Side } = await import("@polymarket/clob-client-v2");
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { polygon } = await import("viem/chains");

    const key = process.env.POLYMARKET_PRIVATE_KEY;
    if (!key) {
      throw new BettingError("LIVE_NOT_CONFIGURED", "Missing POLYMARKET_PRIVATE_KEY.", 503);
    }
    const privateKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    });

    const host = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";
    const chain = process.env.POLYMARKET_CHAIN_ID === "80002" ? Chain.AMOY : Chain.POLYGON;
    const unsigned = new ClobClient({ host, chain, signer: walletClient });
    const creds = {
      key: process.env.POLYMARKET_API_KEY ?? "",
      secret: process.env.POLYMARKET_API_SECRET ?? "",
      passphrase: process.env.POLYMARKET_API_PASSPHRASE ?? "",
    };
    const derived =
      creds.key && creds.secret && creds.passphrase
        ? creds
        : await unsigned.createOrDeriveApiKey();
    const client = new ClobClient({
      host,
      chain,
      signer: walletClient,
      creds: derived,
      funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || undefined,
    });

    const tickSize = TICK_SIZES.includes(request.tickSize as (typeof TICK_SIZES)[number])
      ? (request.tickSize as (typeof TICK_SIZES)[number])
      : "0.01";
    const options = { tickSize, negRisk: request.negRisk };
    const price = Number(formatPrice(request.limitPriceBps));
    const size = Number(formatShares(request.sharesMicros, 2));
    const amount = Number(formatUsd(request.notionalMicros, 2));
    const side = request.side === "SELL" ? Side.SELL : Side.BUY;

    const response =
      request.orderType === "GTC"
        ? await client.createAndPostOrder(
            { tokenID: request.tokenId, price, size, side },
            options,
            OrderType.GTC,
          )
        : await client.createAndPostMarketOrder(
            {
              tokenID: request.tokenId,
              price,
              amount: request.side === "SELL" ? size : amount,
              side,
              orderType: request.orderType === "FOK" ? OrderType.FOK : OrderType.FAK,
            },
            options,
            request.orderType === "FOK" ? OrderType.FOK : OrderType.FAK,
          );

    const failed = response.success === false || Boolean(response.errorMsg);
    const status = failed
      ? "rejected"
      : response.status === "MATCHED"
        ? "filled"
        : response.orderID
          ? "submitted"
          : "failed";
    return {
      mode: "live",
      status,
      polymarketOrderId: response.orderID || null,
      response,
      fills: [],
      errorMessage: response.errorMsg || (failed ? "Polymarket rejected the order" : null),
    };
  } catch (error) {
    if (error instanceof BettingError) throw error;
    const message = error instanceof Error ? error.message : "Live Polymarket submission failed";
    return {
      mode: "live",
      status: "failed",
      polymarketOrderId: null,
      response: { error: message },
      fills: [],
      errorMessage: message,
    };
  }
}
