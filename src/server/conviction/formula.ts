/**
 * ConvictionEngine methodology (v1).
 *
 * All headline math lives here. Callers must not re-implement blends or implied
 * probability. Change weights in ConvictionEngineConfig / env, not in the UI.
 *
 * Each accepted prediction is a vote. Votes collapse to unique wallets so one
 * person cannot appear as many participants. Latest confidence/outcome wins;
 * capital is the sum of that wallet's committed notional (else stake).
 *
 * Implied P(YES):
 *   YES pick at confidence c → c
 *   NO pick at confidence c → 1 − c
 * This is the quantity comparable to Polymarket's YES probability.
 *
 * Inputs used for the headline:
 *   participants              unique wallets
 *   capitalCommitted          sum of capital
 *   averageConfidence         equal-weight mean implied P(YES)
 *   capitalWeightedConfidence capital-weighted mean implied P(YES)
 *   confidence distribution   10 bins of implied P(YES)
 *
 * Headline conviction:
 *   (1 − capitalBlend) * average + capitalBlend * capitalWeighted
 * Default capitalBlend is 55% so 71.8 and 74.2 become 73.1.
 *
 * Per-outcome blocks use stated confidence among wallets that picked that side.
 *
 * Divergence:
 *   Veyra conviction − Polymarket YES probability
 * Positive means Veyra users are more bullish YES than the venue book.
 *
 * Empty markets return null averages/conviction/divergence, not a fake 50.
 */

import type { Outcome } from "@/lib/betting";
import { USDC_SCALE } from "@/server/money";
import type { ConvictionEngineConfig } from "@/server/conviction/config";
import type {
  ConvictionBin,
  ConvictionInternals,
  ConvictionVote,
  OutcomeConviction,
} from "@/server/conviction/types";

export const BPS = 10_000;

export const CONVICTION_DOCUMENTATION = {
  impliedYes:
    "Stated confidence when the pick is YES, otherwise 1 − confidence. Comparable to Polymarket YES probability.",
  averageConfidence: "Equal-weight mean implied P(YES) across unique wallets.",
  capitalWeightedConfidence: "Notional-weighted mean implied P(YES). Stake is used when a position has no fill.",
  conviction:
    "Configurable blend of average and capital-weighted implied P(YES). Default 45/55. Change VEYRA_CONVICTION_CAPITAL_BLEND_BPS to retune.",
  divergence: "Veyra conviction − Polymarket YES probability, in percentage points.",
  participants: "Unique wallets currently holding filled shares on the market.",
};

export function impliedYesBps(outcome: Outcome, confidenceBps: number) {
  const clamped = Math.min(BPS, Math.max(0, confidenceBps));
  return outcome === "YES" ? clamped : BPS - clamped;
}

export function bpsToTenthPct(bps: number | null): number | null {
  if (bps === null) return null;
  return Math.round(bps / 10) / 10;
}

export function bpsToWholePct(bps: number | null): number | null {
  if (bps === null) return null;
  return Math.round(bps / 100);
}

export function capitalUsd(micros: bigint) {
  return Math.round(Number(micros) / Number(USDC_SCALE) * 100) / 100;
}

export function meanBps(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

export function capitalWeightedBps(
  items: { bps: number; capitalMicros: bigint }[],
): number | null {
  let cap = 0n;
  let acc = 0n;
  for (const item of items) {
    if (item.capitalMicros <= 0n) continue;
    cap += item.capitalMicros;
    acc += BigInt(item.bps) * item.capitalMicros;
  }
  if (cap <= 0n) return meanBps(items.map((item) => item.bps));
  return Number(acc / cap);
}

export function blendConvictionBps(
  averageBps: number | null,
  weightedBps: number | null,
  capitalBlendBps: number,
): number | null {
  if (averageBps === null && weightedBps === null) return null;
  if (averageBps === null) return weightedBps;
  if (weightedBps === null) return averageBps;
  const weight = Math.min(BPS, Math.max(0, Math.round(capitalBlendBps)));
  return Math.round((averageBps * (BPS - weight) + weightedBps * weight) / BPS);
}

export function divergenceBps(
  convictionBps: number | null,
  polymarketProbabilityBps: number,
): number | null {
  if (convictionBps === null) return null;
  return convictionBps - polymarketProbabilityBps;
}

function emptyBins(binCount: number): ConvictionBin[] {
  const width = 100 / binCount;
  return Array.from({ length: binCount }, (_, index) => ({
    minPct: index * width,
    maxPct: index === binCount - 1 ? 100 : (index + 1) * width,
    participants: 0,
    capitalCommitted: 0,
  }));
}

export function histogram(
  items: { bps: number; capitalMicros: bigint }[],
  binCount: number,
): ConvictionBin[] {
  const bins = emptyBins(binCount);
  const widthBps = BPS / binCount;
  for (const item of items) {
    const index =
      item.bps >= BPS
        ? binCount - 1
        : Math.min(binCount - 1, Math.max(0, Math.floor(item.bps / widthBps)));
    const bin = bins[index];
    if (!bin) continue;
    bin.participants += 1;
    bin.capitalCommitted = Math.round((bin.capitalCommitted + capitalUsd(item.capitalMicros)) * 100) / 100;
  }
  return bins;
}

function normalizeWallet(wallet: string) {
  return wallet.startsWith("0x") ? wallet.toLowerCase() : wallet;
}

export function isCountableVote(vote: ConvictionVote) {
  return vote.status !== "failed";
}

/**
 * One row per wallet per outcome: latest confidence on that side, capital summed on
 * that side. A wallet holding both YES and NO keeps each side's capital on its own
 * side instead of moving all of it to whichever side it touched last.
 */
export function collapseParticipants(votes: ConvictionVote[]) {
  const byWallet = new Map<
    string,
    { outcome: Outcome; confidenceBps: number; capitalMicros: bigint; createdAt: number }
  >();

  for (const vote of votes) {
    if (!isCountableVote(vote)) continue;
    const key = `${normalizeWallet(vote.walletAddress)}:${vote.outcome}`;
    const createdAt = vote.createdAt.getTime();
    const existing = byWallet.get(key);
    const capital = vote.capitalMicros > 0n ? vote.capitalMicros : 0n;
    if (!existing) {
      byWallet.set(key, {
        outcome: vote.outcome,
        confidenceBps: vote.confidenceBps,
        capitalMicros: capital,
        createdAt,
      });
      continue;
    }
    existing.capitalMicros += capital;
    if (createdAt >= existing.createdAt) {
      existing.confidenceBps = vote.confidenceBps;
      existing.createdAt = createdAt;
    }
  }

  return [...byWallet.values()];
}

function outcomeBlock(
  outcome: Outcome,
  participants: { outcome: Outcome; confidenceBps: number; capitalMicros: bigint }[],
  binCount: number,
): OutcomeConviction {
  const side = participants.filter((item) => item.outcome === outcome);
  const stated = side.map((item) => ({ bps: item.confidenceBps, capitalMicros: item.capitalMicros }));
  return {
    outcome,
    participants: side.length,
    capitalCommitted: capitalUsd(side.reduce((sum, item) => sum + item.capitalMicros, 0n)),
    averageConfidence: bpsToTenthPct(meanBps(stated.map((item) => item.bps))),
    capitalWeightedConfidence: bpsToTenthPct(capitalWeightedBps(stated)),
    distribution: histogram(stated, binCount),
  };
}

export function computeConviction(input: {
  marketId: string;
  votes: ConvictionVote[];
  polymarketProbabilityBps: number;
  config: ConvictionEngineConfig;
}): ConvictionInternals {
  const participants = collapseParticipants(input.votes);
  const implied = participants.map((item) => ({
    bps: impliedYesBps(item.outcome, item.confidenceBps),
    capitalMicros: item.capitalMicros,
  }));
  const capitalMicros = implied.reduce((sum, item) => sum + item.capitalMicros, 0n);
  const averageConfidenceBps = meanBps(implied.map((item) => item.bps));
  const capitalWeightedConfidenceBps = capitalWeightedBps(implied);
  const convictionBps = blendConvictionBps(
    averageConfidenceBps,
    capitalWeightedConfidenceBps,
    input.config.capitalBlendBps,
  );
  const polymarketProbabilityBps = Math.min(
    BPS,
    Math.max(0, Math.round(input.polymarketProbabilityBps)),
  );

  return {
    marketId: input.marketId,
    participants: new Set(
      input.votes.filter(isCountableVote).map((vote) => normalizeWallet(vote.walletAddress)),
    ).size,
    capitalMicros,
    averageConfidenceBps,
    capitalWeightedConfidenceBps,
    convictionBps,
    polymarketProbabilityBps,
    divergenceBps: divergenceBps(convictionBps, polymarketProbabilityBps),
    distribution: histogram(implied, input.config.binCount),
    outcomes: {
      YES: outcomeBlock("YES", participants, input.config.binCount),
      NO: outcomeBlock("NO", participants, input.config.binCount),
    },
  };
}

export function trailFromSnapshots(
  snapshots: { convictionBps: number | null }[],
  liveBps: number | null,
  trailLength: number,
) {
  const percents = snapshots
    .map((row) => bpsToWholePct(row.convictionBps))
    .filter((value): value is number => value !== null);
  const live = bpsToWholePct(liveBps);
  if (live !== null && percents[percents.length - 1] !== live) percents.push(live);
  return percents.slice(-trailLength);
}

export function shouldPersistSnapshot(input: {
  previous: { createdAt: Date; convictionBps: number | null } | null;
  nextConvictionBps: number | null;
  now: Date;
  intervalMs: number;
  minDeltaBps: number;
}) {
  if (input.nextConvictionBps === null) return false;
  if (!input.previous) return true;
  const age = input.now.getTime() - input.previous.createdAt.getTime();
  if (age >= input.intervalMs) return true;
  const previous = input.previous.convictionBps;
  if (previous === null) return age >= Math.min(input.intervalMs, 60_000);
  const coolDown = Math.min(input.intervalMs, 30_000);
  return Math.abs(input.nextConvictionBps - previous) >= input.minDeltaBps && age >= Math.max(1_000, coolDown);
}
