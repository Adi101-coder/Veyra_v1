import { after, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { enqueueMarketResolution, processReputationJobs } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator only. Polymarket markets resolve to Gamma's final outcome (a supplied
 * outcome must match). Catalog-only markets need `{ "outcome": "YES"|"NO"|"INVALID" }`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireOperator(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { outcome?: unknown } | null;
    const job = await enqueueMarketResolution(id, body?.outcome);
    after(async () => {
      await processReputationJobs().catch((error) => {
        console.error("[reputation] job processing failed", { marketId: id, error: String(error) });
      });
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
