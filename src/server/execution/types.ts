import type { OrderBookSnapshot, Outcome } from "@/lib/betting";
import type { EngineWalkFill } from "@/server/confidence/types";

export const EXECUTION_LIFECYCLE = [
  "CREATED",
  "QUEUED",
  "SUBMITTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "RECONCILING",
  "RECONCILED",
] as const;

export type ExecutionLifecycle = (typeof EXECUTION_LIFECYCLE)[number];
export type ExecutionBatchStatus = ExecutionLifecycle | "FAILED";
export type ExecutionIntentStatus =
  | "CREATED"
  | "QUEUED"
  | "PROCESSING"
  | "SUBMITTED"
  | "RECONCILED"
  | "PARTIAL"
  | "FAILED";

export type ExecutionSide = "BUY" | "SELL";

export type ExecutionIntentInput = {
  executionId: string;
  positionId: string;
  predictionId?: string;
  marketId: string;
  outcome: Outcome;
  tokenId: string;
  side: ExecutionSide;
  sharesMicros: bigint;
  notionalMicros: bigint;
  limitPriceBps: number;
  orderType: "FAK" | "FOK" | "GTC";
  tickSize: string;
  negRisk: boolean;
  quotedPriceBps?: number;
  bookHash?: string;
  idempotencyKey?: string;
};

export type ExecutionIntentRow = ExecutionIntentInput & {
  id: string;
  batchId: string | null;
  status: ExecutionIntentStatus;
  executedSharesMicros: bigint;
  executedNotionalMicros: bigint;
  avgPriceBps: number;
  feeMicros: bigint;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExecutionSliceRow = {
  id: string;
  batchId: string;
  side: ExecutionSide;
  sharesMicros: bigint;
  notionalMicros: bigint;
  limitPriceBps: number;
  orderType: string;
  status: string;
  polymarketOrderId: string | null;
  requestJson: string;
  responseJson: string | null;
  errorMessage: string | null;
  attempt: number;
  submittedAt: Date | null;
  createdAt: Date;
};

export type ExecutionMetrics = {
  requestedSharesMicros: bigint;
  requestedNotionalMicros: bigint;
  executedSharesMicros: bigint;
  executedNotionalMicros: bigint;
  venueSharesMicros: bigint;
  internalSharesMicros: bigint;
  avgPriceBps: number;
  arrivalPriceBps: number;
  expectedSlippageBps: number;
  actualSlippageBps: number;
  independentExpectedSlippageBps: number;
  measuredAggregationSlippageDeltaBps: number;
  feeMicros: bigint;
  latencyMs: number;
};

export type ExecutionBatchRow = {
  id: string;
  marketId: string;
  outcome: string;
  tokenId: string;
  netSide: ExecutionSide | "NONE";
  status: ExecutionBatchStatus;
  orderType: string;
  tickSize: string;
  negRisk: boolean;
  bookHash: string | null;
  bookSnapshotJson: string | null;
  strategyJson: string | null;
  metrics: ExecutionMetrics;
  attempts: number;
  idempotencyKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: Date | null;
  submittedAt: Date | null;
  reconciledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  intents: ExecutionIntentRow[];
  slices: ExecutionSliceRow[];
};

export type BookQuality = {
  tokenId: string;
  bestBidBps: number | null;
  bestAskBps: number | null;
  midBps: number | null;
  spreadBps: number | null;
  bidDepthMicros: bigint;
  askDepthMicros: bigint;
  minOrderSizeMicros: bigint;
  tickBps: number;
  hash?: string;
  timestamp?: string;
  stale: boolean;
};

export type StrategySlice = {
  side: ExecutionSide;
  sharesMicros: bigint;
  notionalMicros: bigint;
  limitPriceBps: number;
  reason: "single_touch" | "depth_split" | "max_slice" | "residual";
};

export type ExecutionStrategy = {
  netSide: ExecutionSide | "NONE";
  netSharesMicros: bigint;
  internalSharesMicros: bigint;
  venueSharesMicros: bigint;
  slices: StrategySlice[];
  quality: BookQuality;
  expectedVenueAvgBps: number;
  expectedSlippageBps: number;
  independentExpectedSlippageBps: number;
  notes: string[];
  /** Set when a venue-side safety limit prevented sending any order. */
  blockedReason?: "WIDE_SPREAD";
};

export type InternalMatch = {
  buyIntentId: string;
  sellIntentId: string;
  sharesMicros: bigint;
  priceBps: number;
  notionalMicros: bigint;
};

export type IntentAllocation = {
  intentId: string;
  executionId: string;
  /** pending = venue order accepted but not yet terminal; reconcile before acting on it. */
  status: "filled" | "partial" | "failed" | "pending";
  fills: Array<EngineWalkFill & { feeMicros: bigint; venueTradeId: string; simulated: boolean }>;
  executedSharesMicros: bigint;
  executedNotionalMicros: bigint;
  avgPriceBps: number;
  feeMicros: bigint;
  errorCode?: string;
  errorMessage?: string;
};

export type ProcessResult = {
  batch: ExecutionBatchRow;
  allocations: IntentAllocation[];
};

export type StaleBookCheck = {
  quotedBps?: number;
  liveBps: number;
  maxStaleBps: number;
  book: OrderBookSnapshot;
  maxAgeMs: number;
};
