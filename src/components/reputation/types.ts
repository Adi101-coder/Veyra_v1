import type { PredictionDTO } from "@/lib/betting";

/** Mirrors ReputationEngine.getReputation in src/server/reputation/engine.ts. */
export type ReputationBin = {
  /** e.g. "60-70" */
  bin: string;
  sampleCount: number;
  meanConfidencePct: number;
  /** 0..1 */
  empiricalAccuracy: number;
};

export type ReputationCategory = {
  category: string;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  accuracy: number | null;
  averageConfidencePct: number | null;
  brierScore: string | null;
  roi: string | null;
};

export type Reputation = {
  walletAddress: string;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  accuracy: number | null;
  averageConfidencePct: number | null;
  brierScore: string | null;
  calibration: { ece: number | null; bins: ReputationBin[] };
  roi: string | null;
  categories: ReputationCategory[];
  documentation: {
    brierScore: string;
    accuracy: string;
    averageConfidence: string;
    calibrationEce: string;
    roi: string;
  };
};

export type PredictionResolution = {
  resolvedOutcome: "YES" | "NO" | "INVALID";
  correct: boolean;
  brierScore: string;
  pnlUsd: string;
  resolvedAt: string;
};

export type ScoredPrediction = PredictionDTO & { resolution?: PredictionResolution | null };

export type Loadable<T> =
  | { key: string; status: "ready"; data: T }
  | { key: string; status: "error"; error: string };
