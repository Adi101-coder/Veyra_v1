import type { Outcome } from "@/lib/betting";

export type ConvictionVote = {
  predictionId: string;
  marketId: string;
  walletAddress: string;
  outcome: Outcome;
  confidenceBps: number;
  capitalMicros: bigint;
  createdAt: Date;
  status: string;
};

export type ConvictionBin = {
  minPct: number;
  maxPct: number;
  participants: number;
  capitalCommitted: number;
};

export type OutcomeConviction = {
  outcome: Outcome;
  participants: number;
  capitalCommitted: number;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  distribution: ConvictionBin[];
};

export type ConvictionSnapshotRow = {
  id: string;
  marketId: string;
  engineVersion: string;
  participants: number;
  capitalMicros: bigint;
  averageConfidenceBps: number | null;
  capitalWeightedConfidenceBps: number | null;
  convictionBps: number | null;
  polymarketProbabilityBps: number;
  divergenceBps: number | null;
  distributionJson: string;
  createdAt: Date;
};

export type ConvictionInternals = {
  marketId: string;
  participants: number;
  capitalMicros: bigint;
  averageConfidenceBps: number | null;
  capitalWeightedConfidenceBps: number | null;
  convictionBps: number | null;
  polymarketProbabilityBps: number;
  divergenceBps: number | null;
  distribution: ConvictionBin[];
  outcomes: Record<Outcome, OutcomeConviction>;
};

export type ConvictionDTO = {
  marketId: string;
  participants: number;
  capitalCommitted: number;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  conviction: number | null;
  polymarketProbability: number;
  divergence: number | null;
  trail: number[];
  outcomes: Record<Outcome, OutcomeConviction>;
  distribution: ConvictionBin[];
  methodology: {
    version: string;
    capitalBlendBps: number;
    summary: string;
  };
  snapshotAt: string | null;
};

export type ConvictionStore = {
  listVotes(marketId: string): Promise<ConvictionVote[]>;
  latestSnapshot(marketId: string): Promise<ConvictionSnapshotRow | null>;
  listSnapshots(marketId: string, limit: number): Promise<ConvictionSnapshotRow[]>;
  insertSnapshot(
    row: Omit<ConvictionSnapshotRow, "id" | "createdAt"> & { createdAt?: Date },
  ): Promise<ConvictionSnapshotRow>;
};
