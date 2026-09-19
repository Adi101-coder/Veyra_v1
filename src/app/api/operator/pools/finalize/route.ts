import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { BettingError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { VEYRA_POOL_SOURCE } from "@/server/voting/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ends the pool dispute window and authorizes PAYOUT / liquidity close. */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    const body = (await request.json()) as { marketId?: unknown };
    const marketId = typeof body.marketId === "string" ? body.marketId.trim() : "";
    if (!marketId) throw new BettingError("INVALID_MARKET", "marketId is required.", 400);
    const market = await getPrisma().market.findFirst({
      where: { id: marketId, source: VEYRA_POOL_SOURCE },
    });
    if (!market) throw new BettingError("MARKET_NOT_FOUND", "Pool not found.", 404);
    if (!market.resolvedAt) {
      throw new BettingError("NOT_RESOLVED", "Resolve the pool before authorizing payouts.", 409);
    }
    const updated = await getPrisma().market.update({
      where: { id: marketId },
      data: { payoutsAuthorizedAt: market.payoutsAuthorizedAt ?? new Date() },
    });
    return NextResponse.json({
      marketId: updated.id,
      payoutsAuthorizedAt: updated.payoutsAuthorizedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
