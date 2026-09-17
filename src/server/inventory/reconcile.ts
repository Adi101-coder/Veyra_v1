import { createHash } from "node:crypto";
import { applyFilledDelta } from "@/server/confidence/adjust";
import { RECOVERED_FILL_PREFIX } from "@/server/betting/ledger";

/**
 * Omnibus inventory reconciliation: a pure, read-only comparison of the internal
 * ledger against what Polymarket reports for the omnibus account.
 *
 * Authoritative source per dimension:
 *  - share balances  → venue conditional-token balance per token (CLOB balance)
 *  - fills           → venue trade history (/data/trades), matched both directions
 *  - cost basis      → internal consistency: positions replayed from their own fills
 *  - USDC            → venue collateral balance vs an operator baseline (if configured)
 *
 * Scope: only non-simulated fills. Paper fills describe trades that never happened
 * and are reported as not reconcilable, never as discrepancies. Tokens with orders
 * still awaiting the venue are indeterminate (the ledger is expected to lag).
 */

export type FillSource = "venue" | "internal" | "recovered" | "simulated";

export type LedgerFill = {
  fillId: string;
  executionId: string;
  predictionId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  venueTradeId: string;
  sharesMicros: bigint;
  notionalMicros: bigint;
  feeMicros: bigint;
  isSimulated: boolean;
  filledAt: Date;
  executionCreatedAt: Date;
};

export type LedgerPosition = {
  positionId: string;
  predictionId: string;
  tokenId: string;
  status: string;
  sharesMicros: bigint;
  notionalMicros: bigint;
  avgPriceBps: number;
};

export type LedgerSnapshot = {
  positions: LedgerPosition[];
  fills: LedgerFill[];
  /** tokenId → executions not yet final at the venue (non-paper). */
  pendingByToken: Map<string, number>;
};

export type VenueTrade = {
  tradeId: string;
  orderId: string;
  tokenId: string;
  /** This account's side of the trade. */
  side: "BUY" | "SELL";
  sharesMicros: bigint;
  priceBps: number;
  status: string;
  matchedAt: Date;
};

export type VenueSnapshot = {
  tokenBalances: Map<string, bigint>;
  collateralMicros: bigint | null;
  trades: VenueTrade[];
  tradesSince: Date | null;
};

export type ReconcileConfig = {
  shareToleranceMicros: bigint;
  usdcToleranceMicros: bigint;
  usdcBaseline: { micros: bigint; at: Date } | null;
};

export type Severity = "error" | "warning" | "info";

export type FindingKind =
  | "missing_shares"
  | "unexpected_shares"
  | "venue_trade_not_in_ledger"
  | "ledger_fill_not_at_venue"
  | "excess_recorded_fill"
  | "short_recorded_fill"
  | "position_shares_mismatch"
  | "cost_basis_mismatch"
  | "position_status_mismatch"
  | "mixed_simulated_fills"
  | "recovered_fill_unmatched_id"
  | "usdc_balance_discrepancy"
  | "usdc_unverifiable"
  | "token_indeterminate"
  | "not_reconcilable_simulated";

export type Finding = {
  kind: FindingKind;
  severity: Severity;
  tokenId?: string;
  predictionId?: string;
  executionId?: string;
  venueTradeId?: string;
  expected?: string;
  actual?: string;
  detail: Record<string, unknown>;
  fingerprint: string;
};

const SEVERITY: Record<FindingKind, Severity> = {
  missing_shares: "error",
  unexpected_shares: "error",
  venue_trade_not_in_ledger: "error",
  ledger_fill_not_at_venue: "error",
  excess_recorded_fill: "error",
  short_recorded_fill: "error",
  position_shares_mismatch: "error",
  cost_basis_mismatch: "error",
  position_status_mismatch: "warning",
  mixed_simulated_fills: "error",
  recovered_fill_unmatched_id: "info",
  usdc_balance_discrepancy: "error",
  usdc_unverifiable: "info",
  token_indeterminate: "info",
  not_reconcilable_simulated: "info",
};

const TRADE_FAILED = /FAILED$/i;

export function classifyFill(fill: Pick<LedgerFill, "isSimulated" | "venueTradeId">): FillSource {
  if (fill.isSimulated) return "simulated";
  if (fill.venueTradeId.startsWith("internal-")) return "internal";
  if (fill.venueTradeId.startsWith(RECOVERED_FILL_PREFIX)) return "recovered";
  return "venue";
}

/**
 * Venue reference behind a recorded fill id. POST /order fills carry the joined
 * `tradeIDs` ("t1,t2") or `order:<orderId>` when none were returned; trade-history
 * fills carry the trade id, or `<tradeId>:<orderId>` for maker fills.
 */
export function venueReference(venueTradeId: string): { kind: "trades"; tradeIds: string[] } | { kind: "order"; orderId: string } {
  if (venueTradeId.startsWith("order:")) return { kind: "order", orderId: venueTradeId.slice("order:".length) };
  const tradeIds = venueTradeId
    .split(",")
    .map((part) => {
      const separator = part.indexOf(":");
      return (separator >= 0 ? part.slice(0, separator) : part).trim();
    })
    .filter(Boolean);
  return { kind: "trades", tradeIds: [...new Set(tradeIds)].sort() };
}

function finding(kind: FindingKind, fields: Omit<Finding, "kind" | "severity" | "fingerprint">): Finding {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([kind, fields.tokenId, fields.predictionId, fields.executionId, fields.venueTradeId, fields.expected, fields.actual]))
    .digest("hex");
  return { kind, severity: SEVERITY[kind], ...fields, fingerprint };
}

const abs = (value: bigint) => (value < 0n ? -value : value);

export function reconcileInventory(ledger: LedgerSnapshot, venue: VenueSnapshot, config: ReconcileConfig) {
  const findings: Finding[] = [];

  // ---- Positions: which count toward venue inventory -------------------------------
  const fillsByPrediction = new Map<string, LedgerFill[]>();
  for (const fill of ledger.fills) {
    const list = fillsByPrediction.get(fill.predictionId) ?? [];
    list.push(fill);
    fillsByPrediction.set(fill.predictionId, list);
  }

  const heldByToken = new Map<string, bigint>();
  const realTokens = new Set<string>();
  let simulatedPositions = 0;
  for (const position of ledger.positions) {
    const fills = fillsByPrediction.get(position.predictionId) ?? [];
    const sources = new Set(fills.map(classifyFill));
    if (sources.has("simulated") && [...sources].some((source) => source !== "simulated")) {
      findings.push(finding("mixed_simulated_fills", { tokenId: position.tokenId, predictionId: position.predictionId, detail: { sources: [...sources].sort() } }));
      continue;
    }
    if (sources.has("simulated")) {
      simulatedPositions += 1;
      continue;
    }
    if (!fills.length) continue;
    realTokens.add(position.tokenId);
    heldByToken.set(position.tokenId, (heldByToken.get(position.tokenId) ?? 0n) + position.sharesMicros);

    // Cost basis: replay this position's own fills in execution/fill order.
    const ordered = [...fills].sort(
      (a, b) =>
        a.executionCreatedAt.getTime() - b.executionCreatedAt.getTime() ||
        a.filledAt.getTime() - b.filledAt.getTime() ||
        a.fillId.localeCompare(b.fillId),
    );
    let held = { sharesMicros: 0n, notionalMicros: 0n, avgPriceBps: 0 };
    for (const fill of ordered) held = applyFilledDelta(held, fill.side, fill.sharesMicros, fill.notionalMicros);
    if (held.sharesMicros !== position.sharesMicros) {
      findings.push(finding("position_shares_mismatch", { tokenId: position.tokenId, predictionId: position.predictionId, expected: held.sharesMicros.toString(), actual: position.sharesMicros.toString(), detail: { source: "replay of recorded fills" } }));
    }
    if (held.notionalMicros !== position.notionalMicros) {
      findings.push(finding("cost_basis_mismatch", { tokenId: position.tokenId, predictionId: position.predictionId, expected: held.notionalMicros.toString(), actual: position.notionalMicros.toString(), detail: { expectedAvgPriceBps: held.avgPriceBps, actualAvgPriceBps: position.avgPriceBps } }));
    }
    const statusHoldsShares = ["filled", "partial", "adjusting"].includes(position.status);
    if ((position.sharesMicros > 0n) !== statusHoldsShares && position.status !== "adjusting") {
      findings.push(finding("position_status_mismatch", { tokenId: position.tokenId, predictionId: position.predictionId, expected: position.sharesMicros > 0n ? "filled|partial" : "closed|failed", actual: position.status, detail: { sharesMicros: position.sharesMicros.toString() } }));
    }
  }
  if (simulatedPositions > 0) {
    findings.push(finding("not_reconcilable_simulated", { expected: "0", actual: String(simulatedPositions), detail: { note: "Positions built only from paper fills have no venue counterpart and are excluded." } }));
  }

  // ---- Fills ↔ venue trades ---------------------------------------------------------
  const liveTrades = venue.trades.filter((trade) => !TRADE_FAILED.test(trade.status));
  const tradesById = new Map(liveTrades.map((trade) => [trade.tradeId, trade]));
  const consumed = new Set<string>();
  const groups = new Map<string, { reference: ReturnType<typeof venueReference>; tokenId: string; side: "BUY" | "SELL"; shares: bigint; fills: LedgerFill[] }>();
  for (const fill of ledger.fills) {
    const source = classifyFill(fill);
    if (source === "simulated" || source === "internal") continue;
    if (source === "recovered") {
      findings.push(finding("recovered_fill_unmatched_id", { tokenId: fill.tokenId, predictionId: fill.predictionId, executionId: fill.executionId, venueTradeId: fill.venueTradeId, actual: fill.sharesMicros.toString(), detail: { note: "Aggregate fill restored from execution totals after a crash; venue trade ids unknown." } }));
      continue;
    }
    const reference = venueReference(fill.venueTradeId);
    const key = reference.kind === "order" ? `order:${reference.orderId}` : `trades:${reference.tradeIds.join(",")}`;
    const group = groups.get(key) ?? { reference, tokenId: fill.tokenId, side: fill.side, shares: 0n, fills: [] };
    group.shares += fill.sharesMicros; // pro-rata splits of one venue trade across intents sum back up
    group.fills.push(fill);
    groups.set(key, group);
  }
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const matched =
      group.reference.kind === "order"
        ? liveTrades.filter((trade) => trade.orderId === (group.reference as { orderId: string }).orderId)
        : (group.reference as { tradeIds: string[] }).tradeIds.map((id) => tradesById.get(id)).filter((trade): trade is VenueTrade => Boolean(trade));
    const expectedCount = group.reference.kind === "order" ? 1 : group.reference.tradeIds.length;
    const first = group.fills[0]!;
    if (!matched.length || (group.reference.kind === "trades" && matched.length < expectedCount)) {
      findings.push(finding("ledger_fill_not_at_venue", { tokenId: group.tokenId, predictionId: first.predictionId, executionId: first.executionId, venueTradeId: key, expected: "venue trade", actual: "missing", detail: { recordedSharesMicros: group.shares.toString(), fills: group.fills.map((fill) => fill.fillId).sort() } }));
      for (const trade of matched) consumed.add(trade.tradeId);
      continue;
    }
    for (const trade of matched) consumed.add(trade.tradeId);
    const venueShares = matched.reduce((sum, trade) => sum + (trade.side === group.side ? trade.sharesMicros : -trade.sharesMicros), 0n);
    const diff = group.shares - venueShares;
    if (abs(diff) > config.shareToleranceMicros) {
      findings.push(finding(diff > 0n ? "excess_recorded_fill" : "short_recorded_fill", { tokenId: group.tokenId, predictionId: first.predictionId, executionId: first.executionId, venueTradeId: key, expected: venueShares.toString(), actual: group.shares.toString(), detail: { fills: group.fills.map((fill) => ({ fillId: fill.fillId, executionId: fill.executionId, shares: fill.sharesMicros.toString() })).sort((a, b) => a.fillId.localeCompare(b.fillId)) } }));
    }
  }
  for (const trade of [...liveTrades].sort((a, b) => a.tradeId.localeCompare(b.tradeId))) {
    if (consumed.has(trade.tradeId)) continue;
    findings.push(finding("venue_trade_not_in_ledger", { tokenId: trade.tokenId, venueTradeId: trade.tradeId, expected: "recorded fill", actual: `${trade.side} ${trade.sharesMicros}`, detail: { orderId: trade.orderId, priceBps: trade.priceBps, matchedAt: trade.matchedAt.toISOString() } }));
  }

  // ---- Token balances ---------------------------------------------------------------
  const tokens = new Set<string>([...realTokens, ...liveTrades.map((trade) => trade.tokenId), ...venue.tokenBalances.keys()]);
  for (const tokenId of [...tokens].sort()) {
    const pending = ledger.pendingByToken.get(tokenId) ?? 0;
    const expected = heldByToken.get(tokenId) ?? 0n;
    const actual = venue.tokenBalances.get(tokenId);
    if (pending > 0) {
      findings.push(finding("token_indeterminate", { tokenId, expected: expected.toString(), actual: actual?.toString(), detail: { pendingExecutions: pending } }));
      continue;
    }
    if (actual == null) continue;
    const diff = actual - expected;
    if (abs(diff) > config.shareToleranceMicros) {
      findings.push(finding(diff < 0n ? "missing_shares" : "unexpected_shares", { tokenId, expected: expected.toString(), actual: actual.toString(), detail: { differenceMicros: diff.toString() } }));
    }
  }

  // ---- USDC -------------------------------------------------------------------------
  if (venue.collateralMicros != null) {
    if (!config.usdcBaseline) {
      findings.push(finding("usdc_unverifiable", { actual: venue.collateralMicros.toString(), detail: { note: "Set VEYRA_OMNIBUS_USDC_BASELINE_MICROS and VEYRA_OMNIBUS_USDC_BASELINE_AT to verify." } }));
    } else {
      let expected = config.usdcBaseline.micros;
      for (const fill of ledger.fills) {
        if (classifyFill(fill) !== "venue" && classifyFill(fill) !== "recovered") continue;
        if (fill.filledAt < config.usdcBaseline.at) continue;
        expected += fill.side === "SELL" ? fill.notionalMicros - fill.feeMicros : -(fill.notionalMicros + fill.feeMicros);
      }
      if (abs(venue.collateralMicros - expected) > config.usdcToleranceMicros) {
        findings.push(finding("usdc_balance_discrepancy", { expected: expected.toString(), actual: venue.collateralMicros.toString(), detail: { differenceMicros: (venue.collateralMicros - expected).toString(), baselineAt: config.usdcBaseline.at.toISOString() } }));
      }
    }
  }

  findings.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const counts = { error: 0, warning: 0, info: 0 } as Record<Severity, number>;
  for (const item of findings) counts[item.severity] += 1;
  const summary = {
    tokens: tokens.size,
    reconciledPositions: ledger.positions.length - simulatedPositions,
    simulatedPositions,
    venueTrades: liveTrades.length,
    counts,
    ok: counts.error === 0,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ findings: findings.map((item) => item.fingerprint), summary })).digest("hex");
  return { findings, summary, fingerprint };
}
