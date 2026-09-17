import type { Outcome } from "@/lib/betting";
import type { CalibrationBinInput } from "@/server/reputation/metrics";

/** INVALID = market voided/cancelled: closed without scoring anyone. */
export type ResolutionOutcome = Outcome | "INVALID";

export type Forecast = {
  predictionId: string;
  walletAddress: string;
  marketId: string;
  category: string;
  predictedOutcome: Outcome;
  confidenceBps: number;
  /** Gross USDC spent on filled BUYs. */
  notionalMicros: bigint;
  /** Shares still held at resolution (each pays $1 if correct). */
  payoutMicros: bigint;
  /** USDC received from filled SELLs before resolution. */
  proceedsMicros?: bigint;
};

export type ForecastSource = {
  /** Executions created at or before the cutoff whose venue outcome is not final yet. */
  pendingExecutions?(marketId: string, resolvedAt: Date): Promise<number>;
  /** Every prediction with at least one fill, created at or before `resolvedAt`. */
  listByMarket(marketId: string, resolvedAt: Date): Promise<Forecast[]>;
};

export type ReputationSnapshot = {
  walletAddress: string;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  confidenceSumBps: bigint;
  brierSumMicros: bigint;
  notionalSumMicros: bigint;
  pnlSumMicros: bigint;
  bins: CalibrationBinInput[];
  categories: Array<{
    category: string;
    totalPredictions: number;
    resolvedPredictions: number;
    correctPredictions: number;
    confidenceSumBps: bigint;
    brierSumMicros: bigint;
    notionalSumMicros: bigint;
    pnlSumMicros: bigint;
  }>;
};

export type PredictionScoreRow = {
  predictionId: string;
  walletAddress: string;
  marketId: string;
  category: string;
  predictedOutcome: Outcome;
  resolvedOutcome: Outcome;
  confidenceBps: number;
  impliedYesBps: number;
  correct: boolean;
  brierMicros: bigint;
  notionalMicros: bigint;
  payoutMicros: bigint;
  pnlMicros: bigint;
  resolvedAt: Date;
};

export type ReputationJobRow = {
  id: string;
  marketId: string;
  resolvedOutcome: ResolutionOutcome;
  status: "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  attempts?: number;
  errorMessage: string | null;
  createdAt: Date;
  processedAt: Date | null;
};

export type ReputationStore = {
  recordOpen(input: { predictionId: string; walletAddress: string; category: string }): Promise<boolean>;
  hasScore(predictionId: string): Promise<boolean>;
  saveScore(row: PredictionScoreRow): Promise<void>;
  applyResolution(score: PredictionScoreRow): Promise<void>;
  getReputation(walletAddress: string): Promise<ReputationSnapshot | null>;
  listScores(walletAddress: string): Promise<PredictionScoreRow[]>;
  enqueueJob(marketId: string, resolvedOutcome: ResolutionOutcome): Promise<ReputationJobRow>;
  claimJob(): Promise<ReputationJobRow | null>;
  finishJob(id: string, status: "DONE" | "FAILED", errorMessage?: string): Promise<void>;
  /** Puts a claimed job back in the queue, not claimable before `availableAt`. */
  requeueJob(id: string, input: { errorMessage: string; availableAt: Date; countAttempt: boolean }): Promise<void>;
  markMarketResolved(marketId: string, outcome: ResolutionOutcome, resolvedAt: Date): Promise<void>;
};
