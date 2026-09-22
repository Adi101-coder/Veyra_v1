import { createHash } from "node:crypto";
import type { Outcome } from "@/lib/betting";
import type {
  ConvictionBin,
  ConvictionInternals,
  ConvictionPosition,
  OutcomeConviction,
  PolymarketReference,
} from "@/server/conviction/types";

/**
 * Split Conviction methodology (v2). All numbers are derived here, server-side, from
 * persisted filled positions; clients only format them.
 *
 * Inputs: one row per prediction whose position currently holds filled shares
 * (sharesMicros > 0, status not pending/failed). Pending, failed and zero-fill
 * positions never appear. Capital is the position's cost basis of the shares it
 * holds (maintained by the fill ledger), in USDC micros.
 *
 * 1. Side entries: rows collapse per (wallet, side). Capital is summed; stated
 *    confidence is the capital-weighted mean of that wallet's predictions on the side.
 *    A wallet holding YES and NO keeps two entries, each with its own capital.
 * 2. Implied P(YES) of an entry: YES → confidence, NO → 1 − confidence.
 * 3. participants: distinct wallets with at least one entry.
 * 4. totalCapital: sum of entry capital.
 * 5. averageConfidence: equal weight per wallet. A wallet's implied P(YES) is the
 *    capital-weighted mean over its entries (a balanced hedger lands between sides).
 * 6. capitalWeightedConfidence: Σ(implied × capital) / Σ capital over all entries.
 * 7. conviction: (1 − blend) × average + blend × capitalWeighted, blend from config.
 * 8. divergence: conviction − Polymarket YES midpoint, when a midpoint exists.
 *
 * All intermediate math is integer (bps, micros) with round-half-up division, so the
 * same inputs always give the same outputs. `inputsHash` fingerprints the exact
 * sorted inputs and reference price for audit.
 */

export const BPS = 10_000;
export const METHODOLOGY_VERSION = "v2";

export const CONVICTION_DOCUMENTATION = {
  inputs:
    "Only positions currently holding filled shares. Pending, failed, zero-fill and fully sold positions are excluded.",
  capital: "Cost basis (USDC) of the filled shares each position currently holds, from recorded venue fills.",
  impliedYes: "YES pick: stated confidence. NO pick: 1 − stated confidence. Comparable to Polymarket's YES price.",
  participants: "Distinct wallets holding filled shares on either side.",
  averageConfidence: "Equal weight per wallet; each wallet's implied P(YES) is capital-weighted across its YES and NO holdings.",
  capitalWeightedConfidence: "Σ(implied P(YES) × capital) / Σ capital across every wallet-side holding.",
  conviction: "Blend of average and capital-weighted implied P(YES) (VEYRA_CONVICTION_CAPITAL_BLEND_BPS, default 55% capital-weighted).",
  polymarket: "Polymarket CLOB midpoint for the YES token. After resolution, the resolved YES price. Null when unavailable.",
  divergence: "Split conviction − Polymarket YES probability, in percentage points. Null without both values.",
};

/** Round-half-up integer division for non-negative bigints. */
export function divRound(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) throw new Error("division by zero");
  return (numerator * 2n + denominator) / (2n * denominator);
}

export function impliedYesBps(outcome: Outcome, confidenceBps: number) {
  const clamped = Math.min(BPS, Math.max(0, confidenceBps));
  return outcome === "YES" ? clamped : BPS - clamped;
}

export function bpsToPct(bps: number | null) {
  return bps == null ? null : bps / 100;
}

export function microsToUsd(micros: bigint) {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

type SideEntry = { wallet: string; outcome: Outcome; capitalMicros: bigint; confidenceBps: number };

function normalizeWallet(address: string) {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function eligiblePosition(row: ConvictionPosition) {
  return row.sharesMicros > 0n && row.capitalMicros > 0n && row.status !== "pending" && row.status !== "failed";
}

function sideEntries(rows: ConvictionPosition[]): SideEntry[] {
  const groups = new Map<string, { wallet: string; outcome: Outcome; capital: bigint; weighted: bigint }>();
  for (const row of rows) {
    if (!eligiblePosition(row)) continue;
    const wallet = normalizeWallet(row.walletAddress);
    const key = `${wallet}|${row.outcome}`;
    const group = groups.get(key) ?? { wallet, outcome: row.outcome, capital: 0n, weighted: 0n };
    group.capital += row.capitalMicros;
    group.weighted += row.capitalMicros * BigInt(row.confidenceBps);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      wallet: group.wallet,
      outcome: group.outcome,
      capitalMicros: group.capital,
      confidenceBps: Number(divRound(group.weighted, group.capital)),
    }))
    .sort((a, b) => (a.wallet === b.wallet ? a.outcome.localeCompare(b.outcome) : a.wallet < b.wallet ? -1 : 1));
}

function distribution(entries: SideEntry[], binCount: number, confidenceOf: (entry: SideEntry) => number): ConvictionBin[] {
  const width = BPS / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    minPct: (index * width) / 100,
    maxPct: ((index + 1) * width) / 100,
    participants: 0,
    capitalMicros: 0n,
  }));
  for (const entry of entries) {
    const index = Math.min(binCount - 1, Math.floor(confidenceOf(entry) / width));
    bins[index]!.participants += 1;
    bins[index]!.capitalMicros += entry.capitalMicros;
  }
  return bins.map((bin) => ({
    minPct: bin.minPct,
    maxPct: bin.maxPct,
    participants: bin.participants,
    capitalMicros: bin.capitalMicros.toString(),
    capitalCommitted: Number(bin.capitalMicros) / 1_000_000,
  }));
}

function outcomeBlock(outcome: Outcome, entries: SideEntry[], binCount: number): OutcomeConviction {
  const side = entries.filter((entry) => entry.outcome === outcome);
  const capital = side.reduce((sum, entry) => sum + entry.capitalMicros, 0n);
  const average = side.length
    ? Number(divRound(BigInt(side.reduce((sum, entry) => sum + entry.confidenceBps, 0)), BigInt(side.length)))
    : null;
  const weighted =
    capital > 0n ? Number(divRound(side.reduce((sum, entry) => sum + entry.capitalMicros * BigInt(entry.confidenceBps), 0n), capital)) : null;
  return {
    outcome,
    participants: side.length,
    capitalMicros: capital.toString(),
    capitalCommitted: Number(capital) / 1_000_000,
    averageConfidenceBps: average,
    capitalWeightedConfidenceBps: weighted,
    averageConfidence: bpsToPct(average),
    capitalWeightedConfidence: bpsToPct(weighted),
    distribution: distribution(side, binCount, (entry) => entry.confidenceBps),
  };
}

export function inputsHash(rows: ConvictionPosition[], polymarket: PolymarketReference) {
  const canonical = rows
    .filter(eligiblePosition)
    .map((row) => [row.predictionId, normalizeWallet(row.walletAddress), row.outcome, row.confidenceBps, row.sharesMicros.toString(), row.capitalMicros.toString()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify({ rows: canonical, polymarket })).digest("hex");
}

export function computeConviction(input: {
  marketId: string;
  positions: ConvictionPosition[];
  polymarket: PolymarketReference;
  capitalBlendBps: number;
  binCount: number;
}): ConvictionInternals {
  const entries = sideEntries(input.positions);
  const wallets = new Map<string, { capital: bigint; weighted: bigint }>();
  let totalCapital = 0n;
  let weightedImplied = 0n;
  for (const entry of entries) {
    const implied = BigInt(impliedYesBps(entry.outcome, entry.confidenceBps));
    totalCapital += entry.capitalMicros;
    weightedImplied += implied * entry.capitalMicros;
    const wallet = wallets.get(entry.wallet) ?? { capital: 0n, weighted: 0n };
    wallet.capital += entry.capitalMicros;
    wallet.weighted += implied * entry.capitalMicros;
    wallets.set(entry.wallet, wallet);
  }

  const walletImplied = [...wallets.values()].map((wallet) => divRound(wallet.weighted, wallet.capital));
  const averageConfidenceBps = walletImplied.length
    ? Number(divRound(walletImplied.reduce((sum, value) => sum + value, 0n), BigInt(walletImplied.length)))
    : null;
  const capitalWeightedConfidenceBps = totalCapital > 0n ? Number(divRound(weightedImplied, totalCapital)) : null;
  const blend = BigInt(Math.min(BPS, Math.max(0, input.capitalBlendBps)));
  const convictionBps =
    averageConfidenceBps != null && capitalWeightedConfidenceBps != null
      ? Number(divRound(BigInt(averageConfidenceBps) * (10_000n - blend) + BigInt(capitalWeightedConfidenceBps) * blend, 10_000n))
      : null;
  const polymarketBps = input.polymarket.probabilityBps;
  const divergenceBps = convictionBps != null && polymarketBps != null ? convictionBps - polymarketBps : null;

  return {
    marketId: input.marketId,
    participants: wallets.size,
    capitalMicros: totalCapital,
    averageConfidenceBps,
    capitalWeightedConfidenceBps,
    convictionBps,
    polymarket: input.polymarket,
    divergenceBps,
    outcomes: {
      YES: outcomeBlock("YES", entries, input.binCount),
      NO: outcomeBlock("NO", entries, input.binCount),
    },
    distribution: distribution(entries, input.binCount, (entry) => impliedYesBps(entry.outcome, entry.confidenceBps)),
    inputsHash: inputsHash(input.positions, input.polymarket),
  };
}

/** Snapshot every `intervalMs` bucket; at most one row per market per bucket (DB unique). */
export function snapshotBucket(at: Date, intervalMs: number) {
  return new Date(Math.floor(at.getTime() / intervalMs) * intervalMs);
}

export function trailFromSnapshots(convictionBpsHistory: (number | null)[], currentBps: number | null, length: number) {
  const values = [...convictionBpsHistory, currentBps].filter((value): value is number => value != null);
  const deduped = values.filter((value, index) => index === 0 || value !== values[index - 1]);
  return deduped.slice(-length).map((bps) => Math.round(bps / 100));
}
