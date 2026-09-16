import { after } from "next/server";
import { NextResponse } from "next/server";
import { enqueueMarketResolution, processReputationJobs } from "@/server/betting/service";
import { jsonError } from "@/server/http";
import { BettingError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new BettingError("INVALID_BODY", "JSON body with outcome is required.");
    }
    const job = await enqueueMarketResolution(id, (body as { outcome?: unknown }).outcome);
    after(() => {
      void processReputationJobs();
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
