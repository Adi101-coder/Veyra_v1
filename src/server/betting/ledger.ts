import { applyFilledDelta } from "@/server/confidence/adjust";
import type { StoredFill } from "@/server/betting/repository";

/**
 * Position ledger rules shared by the Prisma and in-memory stores. A position's
 * shares/notional change only when a venue (or paper) fill is recorded against
 * one of its executions — never because an order was created or submitted.
 */

const PENDING_EXECUTION = new Set(["created", "submitted", "open", "unknown"]);
const FILLED_EXECUTION = new Set(["filled", "partial"]);

export function isPendingExecutionStatus(status: string) {
  return PENDING_EXECUTION.has(status);
}

/** Prefix of an aggregate fill synthesized by crash recovery from an intent's executed totals. */
export const RECOVERED_FILL_PREFIX = "intent:";

/**
 * Drops fills already recorded for this execution (same venue trade id). Venue
 * fills and a recovered aggregate describe the same shares, so they are mutually
 * exclusive per execution: whichever is recorded first wins, the other applies nothing.
 */
export function unseenFills(existing: { venueTradeId: string | null }[], incoming: StoredFill[]) {
  const existingRecovered = existing.some((fill) => fill.venueTradeId?.startsWith(RECOVERED_FILL_PREFIX));
  const incomingRecovered = incoming.some((fill) => fill.venueTradeId.startsWith(RECOVERED_FILL_PREFIX));
  if (existingRecovered) return [];
  if (incomingRecovered && existing.length > 0) return [];
  const seen = new Set(existing.map((fill) => fill.venueTradeId).filter(Boolean));
  const fresh: StoredFill[] = [];
  for (const fill of incoming) {
    if (seen.has(fill.venueTradeId)) continue;
    seen.add(fill.venueTradeId);
    fresh.push(fill);
  }
  return fresh;
}

export function applyFillsToHeld(
  held: { sharesMicros: bigint; notionalMicros: bigint; avgPriceBps: number },
  side: string,
  fills: StoredFill[],
) {
  const shares = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  const notional = fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);
  return applyFilledDelta(held, side === "SELL" ? "SELL" : "BUY", shares, notional);
}

/**
 * pending   – opening order not yet reconciled, no shares held
 * adjusting – holds shares and an adjustment order is still in flight
 * partial   – opening order finished partially filled
 * filled    – holds shares
 * closed    – had fills, now holds zero shares
 * failed    – nothing ever filled and nothing is pending
 */
export function derivePositionStatus(
  executions: { id: string; status: string; createdAt: Date }[],
  sharesMicros: bigint,
) {
  const pending = executions.some((row) => isPendingExecutionStatus(row.status));
  if (pending) return sharesMicros > 0n ? "adjusting" : "pending";
  if (sharesMicros > 0n) {
    const opening = [...executions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    return executions.length === 1 && opening?.status === "partial" ? "partial" : "filled";
  }
  return executions.some((row) => FILLED_EXECUTION.has(row.status)) ? "closed" : "failed";
}

/** Final confidence-history status once an adjustment execution is terminal, else null. */
export function settledHistoryStatus(executionStatus: string) {
  if (isPendingExecutionStatus(executionStatus)) return null;
  if (executionStatus === "filled") return "filled";
  if (executionStatus === "partial") return "partial";
  return "failed";
}
