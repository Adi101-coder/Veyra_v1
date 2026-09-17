export type Outcome = "YES" | "NO";

export type BookLevel = {
  price: string;
  size: string;
};

export type OrderBookSnapshot = {
  tokenId: string;
  conditionId?: string;
  timestamp?: string;
  hash?: string;
  bids: BookLevel[];
  asks: BookLevel[];
  minOrderSize: string;
  tickSize: string;
  negRisk: boolean;
  lastTradePrice?: string;
  source: "polymarket" | "synthetic";
};

export type QuoteRequest = {
  marketId: string;
  outcome: Outcome;
  confidencePct: number;
  stakeUsd: string;
};

export type PlacePredictionRequest = QuoteRequest & {
  walletAddress: string;
  idempotencyKey?: string;
};

export type ChangeConfidenceRequest = {
  confidencePct: number;
  walletAddress: string;
  idempotencyKey?: string;
  quotedMarketPrice?: string;
  expectedConfidencePct?: number;
};

export type EngineFillLevel = {
  price: string;
  shares: string;
  notionalUsd: string;
};

export type EnginePosition = {
  outcome: Outcome;
  side: "BUY";
  tokenId: string;
  shares: string;
  limitPrice: string;
  avgPrice: string;
  notionalUsd: string;
  payoutUsd: string;
  edgeBps: number;
  kellyBps: number;
  sizedKellyBps: number;
  marketPrice: string;
  bestAsk: string;
  tickSize: string;
  minOrderSize: string;
  fills: EngineFillLevel[];
};

export type EngineQuote = {
  accepted: boolean;
  engineVersion: string;
  rejection?: { code: string; message: string };
  position: EnginePosition | null;
  market: {
    id: string;
    title: string;
    source: string;
    yesPrice: string;
    tokenId: string;
  };
  book: {
    source: OrderBookSnapshot["source"];
    hash?: string;
    timestamp?: string;
  };
};

export type FillDTO = {
  id: string;
  price: string;
  shares: string;
  notionalUsd: string;
  feeUsd: string;
  simulated: boolean;
  venueTradeId: string | null;
  filledAt: string;
};

export type ExecutionDTO = {
  id: string;
  venue: string;
  mode: "paper" | "live";
  status: string;
  orderType: string;
  limitPrice: string;
  sizeShares: string;
  notionalUsd: string;
  polymarketOrderId: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  fills: FillDTO[];
};

export type PositionDTO = {
  id: string;
  outcome: Outcome;
  side: string;
  tokenId: string;
  shares: string;
  limitPrice: string;
  avgPrice: string;
  notionalUsd: string;
  payoutUsd: string;
  edgeBps: number;
  kellyBps: number;
  status: string;
};

export type PredictionDTO = {
  id: string;
  marketId: string;
  marketTitle: string;
  walletAddress: string;
  outcome: Outcome;
  confidencePct: number;
  stakeUsd: string;
  marketPrice: string;
  status: string;
  engineVersion: string;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  position: PositionDTO | null;
  execution: ExecutionDTO | null;
};

export type PositionSnapshotDTO = {
  shares: string;
  notionalUsd: string;
  avgPrice: string;
};

export type ConfidenceHistoryDTO = {
  id: string;
  predictionId: string;
  previousConfidencePct: number;
  newConfidencePct: number;
  previousPosition: PositionSnapshotDTO;
  desiredPosition: PositionSnapshotDTO;
  deltaShares: string;
  side: "BUY" | "SELL" | "NONE";
  marketPrice: string;
  status: string;
  executionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  reconciledAt: string | null;
};

export type ExecutionMetricsDTO = {
  requestedShares: string;
  requestedNotionalUsd: string;
  executedShares: string;
  executedNotionalUsd: string;
  averageExecutionPrice: string;
  expectedSlippageBps: number;
  actualSlippageBps: number;
  independentExpectedSlippageBps: number;
  measuredAggregationSlippageDeltaBps: number;
  latencyMs: number;
  feeUsd: string;
  venueShares: string;
  internalShares: string;
};

export type ExecutionBatchDTO = {
  id: string;
  marketId: string;
  tokenId: string;
  outcome: string;
  netSide: string;
  status: string;
  intentCount: number;
  sliceCount: number;
  metrics: ExecutionMetricsDTO;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  submittedAt: string | null;
  reconciledAt: string | null;
};

/** True when the position holds recorded fills (shares > 0). */
export function hasFilledShares(dto: PredictionDTO) {
  const shares = Number.parseFloat(dto.position?.shares ?? "0");
  return Number.isFinite(shares) && shares > 0;
}

/** Maps API error codes to a readable one-line message; falls back to the server message. */
export function describeBettingError(error: unknown, fallback: string) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const serverMessage = error instanceof Error && error.message ? error.message : null;
  switch (code) {
    case "UNAUTHENTICATED":
      return "Connect and sign in with your wallet to continue.";
    case "MARKET_RESOLVED":
      return serverMessage ?? "This market has resolved. Positions can no longer change.";
    case "NOT_EXECUTABLE":
      return serverMessage ?? "This position can't be adjusted right now.";
    case "INSUFFICIENT_LIQUIDITY":
      return serverMessage ?? "Not enough liquidity on the book for this size.";
    case "CONCURRENT_UPDATE":
      return "This position just changed elsewhere. Refresh and try again.";
    case "RATE_LIMITED":
      return "Too many requests. Wait a moment and try again.";
    default:
      return serverMessage ?? fallback;
  }
}

export function predictionToWagerRow(
  dto: PredictionDTO,
  shorten: (value: string) => string,
): import("@/lib/markets").WagerRow {
  // Only recorded fills lock a seat. Pending and failed orders stay open and
  // unresolved; their state is surfaced through lockBy (execution/position status).
  const locked = hasFilledShares(dto);
  const marketPct = Math.round(Number.parseFloat(dto.marketPrice) * 100);
  return {
    id: dto.id,
    stake: `$${dto.stakeUsd}`,
    gold: dto.position ? `${dto.position.shares} sh` : "—",
    lockBy: dto.execution?.status ?? dto.position?.status ?? dto.status,
    mechanism: "Confidence",
    resolution: "PENDING",
    expired: false,
    left: {
      wallet: shorten(dto.walletAddress),
      avatar: dto.walletAddress,
      belief: Math.round(dto.confidencePct),
      note: locked ? "LOCKED" : "OPEN",
    },
    right: {
      wallet: dto.outcome === "YES" ? "Book YES" : "Book NO",
      avatar: `${dto.marketId}-${dto.outcome}`,
      belief: Number.isFinite(marketPct) ? marketPct : 50,
      note: locked ? "LOCKED" : "OPEN",
    },
  };
}
