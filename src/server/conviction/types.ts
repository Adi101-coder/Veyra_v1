import type { Outcome } from "@/lib/betting";

/** One prediction's filled position as persisted by the fill ledger. */
export type ConvictionPosition = {
  predictionId: string;
  walletAddress: string;
  outcome: Outcome;
  /** Current prediction confidence (moves only when an adjustment fully fills). */
  confidenceBps: number;
  sharesMicros: bigint;
  /** Cost basis of held shares, USDC micros. */
  capitalMicros: bigint;
  status: string;
};

export type PolymarketReference = {
  probabilityBps: number | null;
  source: "clob_midpoint" | "resolved" | "unavailable";
};

export type ConvictionBin = {
  minPct: number;
  maxPct: number;
  participants: number;
  capitalMicros: string;
  /** Display convenience derived from capitalMicros. */
  capitalCommitted: number;
};

export type OutcomeConviction = {
  outcome: Outcome;
  participants: number;
  capitalMicros: string;
  capitalCommitted: number;
  averageConfidenceBps: number | null;
  capitalWeightedConfidenceBps: number | null;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  distribution: ConvictionBin[];
};

export type ConvictionInternals = {
  marketId: string;
  participants: number;
  capitalMicros: bigint;
  averageConfidenceBps: number | null;
  capitalWeightedConfidenceBps: number | null;
  convictionBps: number | null;
  polymarket: PolymarketReference;
  divergenceBps: number | null;
  outcomes: Record<Outcome, OutcomeConviction>;
  distribution: ConvictionBin[];
  inputsHash: string;
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
  polymarketProbabilityBps: number | null;
  divergenceBps: number | null;
  distributionJson: string;
  inputsHash: string | null;
  bucketStart: Date | null;
  createdAt: Date;
};

export type ConvictionDTO = {
  marketId: string;
  participants: number;
  /** Total filled capital (cost basis of held shares), USDC decimal string. */
  totalCapitalUsd: string;
  capitalMicros: string;
  /** Display convenience derived from capitalMicros. */
  capitalCommitted: number;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  conviction: number | null;
  averageConfidenceBps: number | null;
  capitalWeightedConfidenceBps: number | null;
  convictionBps: number | null;
  polymarketProbability: number | null;
  polymarketProbabilityBps: number | null;
  polymarketSource: PolymarketReference["source"];
  divergence: number | null;
  divergenceBps: number | null;
  trail: number[];
  outcomes: Record<Outcome, OutcomeConviction>;
  distribution: ConvictionBin[];
  resolution: { outcome: string; resolvedAt: string } | null;
  methodology: {
    version: string;
    capitalBlendBps: number;
    summary: string;
    definitions: Record<string, string>;
  };
  inputsHash: string;
  /** When these numbers were computed (always set; use to order realtime events). */
  asOf: string;
  /** Last persisted snapshot time, if any. */
  snapshotAt: string | null;
};

export type ConvictionStore = {
  listPositions(marketId: string): Promise<ConvictionPosition[]>;
  getResolution(marketId: string): Promise<{ outcome: string; resolvedAt: Date } | null>;
  listSnapshots(marketId: string, limit: number): Promise<ConvictionSnapshotRow[]>;
  /** Inserts unless a snapshot for (marketId, bucketStart) exists; returns the bucket's row. */
  upsertSnapshot(row: Omit<ConvictionSnapshotRow, "id" | "createdAt">): Promise<ConvictionSnapshotRow>;
};
