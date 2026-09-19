import "server-only";

import { VEYRA_POOL_SOURCE } from "@/server/voting/config";

/**
 * Whether cash may leave the house for a resolved market.
 *
 * Polymarket resolutions are venue-final. Veyra pools wait for a dispute window
 * (or an operator finalize) so an operator-picked outcome can be challenged
 * before PAYOUT / FEE_DEBIT / liquidity close.
 */
export function disputeWindowHours(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number.parseInt((env.VEYRA_POOL_DISPUTE_WINDOW_HOURS ?? "24").trim(), 10);
  if (!Number.isInteger(raw) || raw < 0 || raw > 24 * 30) return 24;
  return raw;
}

export function poolPayoutsOpen(
  market: {
    source: string;
    resolvedAt: Date | null;
    payoutsAuthorizedAt?: Date | null;
  },
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
) {
  if (market.source !== VEYRA_POOL_SOURCE) return Boolean(market.resolvedAt);
  if (market.payoutsAuthorizedAt) return true;
  if (!market.resolvedAt) return false;
  const waitMs = disputeWindowHours(env) * 60 * 60 * 1000;
  return now.getTime() >= market.resolvedAt.getTime() + waitMs;
}
