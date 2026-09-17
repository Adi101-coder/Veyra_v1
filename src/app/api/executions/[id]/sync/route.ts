import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { getPredictionByExecution, syncExecution } from "@/server/betting/service";
import { BettingError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-triggered reconciliation of one execution against Polymarket. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const wallet = requireWallet(request);
    rateLimit(request, "sync", 20, 60_000, wallet);
    const { id } = await context.params;
    const owner = await getPredictionByExecution(id);
    if (!owner) throw new BettingError("EXECUTION_NOT_FOUND", "Execution not found.", 404);
    if (owner.walletAddress !== wallet) {
      throw new BettingError("FORBIDDEN", "This execution belongs to another wallet.", 403);
    }
    const prediction = await syncExecution(id);
    return NextResponse.json({ prediction });
  } catch (error) {
    return jsonError(error);
  }
}
