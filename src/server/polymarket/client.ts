import "server-only";

import type { OrderBookSnapshot } from "@/lib/betting";
import type { EngineWalkFill } from "@/server/confidence/types";
import { BettingError } from "@/server/errors";
import { formatPrice, formatShares, formatUsd, sharesCostMicros } from "@/server/money";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { filledShares, walkSide } from "@/server/execution/math";
import type { ExecutionSide } from "@/server/execution/types";
import type { ExecutionRequest, ExecutionSubmitResult, ExecutorPort } from "@/server/polymarket/executor";
import { fetchClobBook, fetchClobOrder, fetchClobPrice } from "@/server/polymarket/clob";

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
  mode: "paper" | "live";
  status: "submitted" | "open" | "filled" | "partial" | "rejected" | "failed";
  polymarketOrderId: string | null;
  response: unknown;
  fills: VenueFill[];
  errorMessage: string | null;
};

export type PolymarketClient = {
  mode: "paper" | "live";
  getBook(tokenId: string): Promise<OrderBookSnapshot>;
  getPrice(tokenId: string, side: ExecutionSide): Promise<string | null>;
  getOrder(orderId: string): Promise<VenueOrderResult | null>;
  submitOrder(request: VenueOrderRequest): Promise<VenueOrderResult>;
};

export function createPolymarketClient(options?: {
  mode?: "paper" | "live";
  getBook?: (tokenId: string) => Promise<OrderBookSnapshot>;
  submitOrder?: (request: VenueOrderRequest) => Promise<VenueOrderResult>;
  getOrder?: (orderId: string) => Promise<VenueOrderResult | null>;
}): PolymarketClient {
  const mode = options?.mode ?? (process.env.POLYMARKET_EXECUTION_MODE === "live" ? "live" : "paper");
  return {
    mode,
    getBook: options?.getBook ?? fetchClobBook,
    getPrice: (tokenId, side) => fetchClobPrice(tokenId, side),
    getOrder:
      options?.getOrder ??
      (async (orderId) => {
        const order = await fetchClobOrder(orderId);
        return mapClobOrder(order, orderId, mode);
      }),
    submitOrder:
      options?.submitOrder ??
      (mode === "live" ? submitLiveVenueOrder : (request) => Promise.resolve(paperFill(request))),
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
      const result = await executor.getOrder(orderId);
      return result ? toVenue(result) : null;
    },
    async submitOrder(request) {
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

function paperFill(request: VenueOrderRequest): VenueOrderResult {
  const lot = defaultExecutionEngineConfig.shareLotMicros;
  const fills: EngineWalkFill[] = request.book
    ? walkSide(request.book, request.side, request.limitPriceBps, request.sharesMicros, lot)
    : [];
  const mapped: VenueFill[] = fills.map((fill, index) => ({
    ...fill,
    feeMicros: 0n,
    venueTradeId: `paper-${index + 1}`,
    simulated: true,
    raw: fill,
  }));
  const filled = filledShares(mapped);
  return {
    mode: "paper",
    status: filled >= request.sharesMicros ? "filled" : filled > 0n ? "partial" : "failed",
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

function mapClobOrder(
  order: { id?: string; status?: string; size_matched?: string; original_size?: string; error?: string },
  orderId: string,
  mode: "paper" | "live",
): VenueOrderResult {
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
    mode,
    status,
    polymarketOrderId: order.id ?? orderId,
    response: order,
    fills: [],
    errorMessage: order.error ?? null,
  };
}

const TICK_SIZES = ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"] as const;

async function submitLiveVenueOrder(request: VenueOrderRequest): Promise<VenueOrderResult> {
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
      creds.key && creds.secret && creds.passphrase ? creds : await unsigned.createOrDeriveApiKey();
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
    const fills: VenueFill[] = [];
    if (!failed && request.book) {
      const walked = walkSide(
        request.book,
        request.side,
        request.limitPriceBps,
        request.sharesMicros,
        defaultExecutionEngineConfig.shareLotMicros,
      );
      for (const [index, fill] of walked.entries()) {
        fills.push({
          ...fill,
          feeMicros: 0n,
          venueTradeId: response.orderID ? `${response.orderID}-${index + 1}` : `live-${index + 1}`,
          simulated: false,
          raw: fill,
        });
      }
    }
    const matched = filledShares(fills);
    const status = failed
      ? "rejected"
      : response.status === "MATCHED" || matched >= request.sharesMicros
        ? "filled"
        : matched > 0n
          ? "partial"
          : response.orderID
            ? "submitted"
            : "failed";
    return {
      mode: "live",
      status,
      polymarketOrderId: response.orderID || null,
      response,
      fills,
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

export function notionalFromShares(sharesMicros: bigint, priceBps: number) {
  return sharesCostMicros(sharesMicros, priceBps);
}
