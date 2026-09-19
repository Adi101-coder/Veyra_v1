import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { enqueueMarketResolution } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves a Veyra-native pool. Polymarket-backed markets settle from Gamma/UMA;
 * pools have no venue, so an operator supplies the outcome. The worker then scores
 * reputation and settles the pool's liquidity from those scores.
 */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    const body = (await request.json()) as { marketId?: unknown; outcome?: unknown };
    const marketId = typeof body.marketId === "string" ? body.marketId.trim() : "";
    const job = await enqueueMarketResolution(marketId, body.outcome);
    return NextResponse.json({
      marketId: job.marketId,
      outcome: job.resolvedOutcome,
      status: job.status,
    });
  } catch (error) {
    return jsonError(error);
  }
}
