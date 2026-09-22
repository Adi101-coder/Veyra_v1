export type Outcome = "YES" | "NO";

export type BookLevel = {
  price: string;
  size: string;
};

export type OrderBookSnapshot = {
  tokenId: string;
  conditionId?: string;
  timestamp?: string;
  /** Wall-clock ms when we fetched this snapshot. Venue `timestamp` is last change, not fetch time. */
  fetchedAt?: number;
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
  /** Set once the market has resolved (INVALID = voided). */
  marketResolution: { outcome: "YES" | "NO" | "INVALID"; resolvedAt: string } | null;
  /**
   * Reputation `PredictionScore` after the resolve job. Same Brier / PnL / payout
   * CUSTODY.md §5.5 uses for PAYOUT and pool FEE_DEBIT. Null until scored.
   */
  score: PredictionScoreDTO | null;
  /** Robinhood Chain settlement reference. Only status "confirmed" means mined and final. */
  settlement: SettlementReferenceDTO | null;
};

export type PredictionScoreDTO = {
  resolvedOutcome: Outcome;
  correct: boolean;
  brierScore: string;
  pnlUsd: string;
  payoutUsd: string;
  /** Stated confidence at the resolution cutoff, in percent. */
  confidencePct: number;
  resolvedAt: string;
};

export type SettlementReferenceDTO = {
  chainId: number;
  network: string;
  status: "queued" | "signing" | "signed" | "submitted" | "confirmed" | "reverted" | "failed";
  txHash: string | null;
  blockNumber: string | null;
  confirmations: number;
  payloadHash: string;
  explorerUrl: string | null;
  confirmedAt: string | null;
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
      return "Connect and verify your wallet to continue.";
    case "INVALID_SIGNATURE":
    case "INVALID_NONCE":
      return "Wallet verification failed. Please try again.";
    case "FORBIDDEN":
      return "This wallet can't change that position.";
    case "CSRF":
      return "Your session check failed. Refresh the page and try again.";
    case "CONCURRENT_UPDATE":
      return "Another change on this position is still executing. Try again in a moment.";
    case "POSITION_NOT_READY":
      return "Your position is still being filled. You can change confidence once it has fills.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "This request was already submitted with different details. Refresh and try again.";
    case "STALE_PRICE":
      return "The market moved. Review the new quote and try again.";
    case "STALE_BOOK":
      return "Market prices are out of date. Wait a moment and try again.";
    case "WIDE_SPREAD":
      return "The market spread is too wide to trade fairly right now.";
    case "CONFIDENCE_RANGE":
      return serverMessage ?? "Choose a confidence within the allowed range.";
    case "MARKET_RESOLVED":
      return "This market has resolved. Positions can no longer change.";
    case "MARKET_CLOSED":
      return "This market is no longer accepting orders.";
    case "NOT_EXECUTABLE":
      return "This position can't be traded right now.";
    case "INSUFFICIENT_LIQUIDITY":
      return "Not enough liquidity at a fair price right now.";
    case "UNCHANGED":
      return "Confidence is already at that value.";
    case "RATE_LIMITED":
      return "Too many requests. Wait a moment and try again.";
    case "INSUFFICIENT_FUNDS":
      return "Not enough deposited USDC for this order. Deposit from Balances, then try again.";
    case "PROPOSER_CANNOT_TRADE":
      return "You proposed this pool, so you cannot trade it while Split is the counterparty.";
    default:
      return serverMessage ?? fallback;
  }
}

/** Engine quote rejections carry the same error codes; reuse the friendly copy. */
export function describeQuoteRejection(rejection: { code: string; message: string }) {
  return describeBettingError(Object.assign(new Error(rejection.message), { code: rejection.code }), rejection.message);
}

export function predictionToWagerRow(
  dto: PredictionDTO,
  shorten: (value: string) => string,
): import("@/lib/markets").WagerRow {
  // Only recorded fills lock a seat. Pending and failed orders stay open and
  // unresolved; their state is surfaced through lockBy (execution/position status).
  const locked = hasFilledShares(dto);
  const scored = dto.score;
  const resolved = scored?.resolvedOutcome ?? dto.marketResolution?.outcome;
  const userNote: import("@/lib/markets").SeatNote = resolved
    ? resolved === "INVALID"
      ? "PUSH"
      : scored
        ? scored.correct
          ? "LANDED"
          : "MISSED"
        : resolved === dto.outcome
          ? "LANDED"
          : "MISSED"
    : locked
      ? "LOCKED"
      : "OPEN";
  const marketNote: import("@/lib/markets").SeatNote =
    userNote === "LANDED" ? "MISSED" : userNote === "MISSED" ? "LANDED" : userNote;
  const marketPct = Math.round(Number.parseFloat(dto.marketPrice) * 100);
  return {
    id: dto.id,
    stake: `$${dto.stakeUsd}`,
    gold: dto.position ? `${dto.position.shares} sh` : "—",
    lockBy: dto.execution?.status ?? dto.position?.status ?? dto.status,
    mechanism: "Confidence",
    resolution: scored || dto.marketResolution ? "RESOLVED" : "PENDING",
    expired: false,
    left: {
      wallet: shorten(dto.walletAddress),
      avatar: dto.walletAddress,
      belief: Math.round(dto.confidencePct),
      note: userNote,
    },
    right: {
      wallet: dto.outcome === "YES" ? "Book YES" : "Book NO",
      avatar: `${dto.marketId}-${dto.outcome}`,
      belief: Number.isFinite(marketPct) ? marketPct : 50,
      note: marketNote,
    },
  };
}
