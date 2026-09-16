import type { Outcome } from "@/lib/betting";
import type { CalibrationBinInput } from "@/server/reputation/metrics";

export type Forecast = {
  predictionId: string;
  walletAddress: string;
  marketId: string;
  category: string;
  predictedOutcome: Outcome;
  confidenceBps: number;
  notionalMicros: bigint;
  payoutMicros: bigint;
};

export type ForecastSource = {
  listByMarket(marketId: string): Promise<Forecast[]>;
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
  resolvedOutcome: Outcome;
  status: "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
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
  enqueueJob(marketId: string, resolvedOutcome: Outcome): Promise<ReputationJobRow>;
  claimJob(): Promise<ReputationJobRow | null>;
  finishJob(id: string, status: "DONE" | "FAILED", errorMessage?: string): Promise<void>;
  markMarketResolved(marketId: string, outcome: Outcome, resolvedAt: Date): Promise<void>;
};
