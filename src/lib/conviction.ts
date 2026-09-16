export type ConvictionBin = {
  minPct: number;
  maxPct: number;
  participants: number;
  capitalCommitted: number;
};

export type OutcomeConviction = {
  outcome: "YES" | "NO";
  participants: number;
  capitalCommitted: number;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  distribution: ConvictionBin[];
};

export type MarketConviction = {
  marketId: string;
  participants: number;
  capitalCommitted: number;
  averageConfidence: number | null;
  capitalWeightedConfidence: number | null;
  conviction: number | null;
  polymarketProbability: number;
  divergence: number | null;
  trail: number[];
  outcomes: {
    YES: OutcomeConviction;
    NO: OutcomeConviction;
  };
  distribution: ConvictionBin[];
  methodology: {
    version: string;
    capitalBlendBps: number;
    summary: string;
  };
  snapshotAt: string | null;
};

export function formatConvictionPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function formatDivergence(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function convictionTrailLabel(trail: number[]) {
  if (trail.length < 2) return null;
  return trail.map((value) => `${value}%`).join(" → ");
}
