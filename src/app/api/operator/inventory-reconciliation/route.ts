import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { configuredInventoryVenue, latestReconciliationReport, runInventoryReconciliation } from "@/server/inventory/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator: latest read-only omnibus inventory reconciliation report. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    return NextResponse.json({ report: await latestReconciliationReport(getPrisma()) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Operator: run a reconciliation now (singleton-leased; never modifies balances or positions). */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    const prisma = getPrisma();
    const result = await runInventoryReconciliation({ prisma, venue: await configuredInventoryVenue() });
    const report = result.status === "completed" || result.status === "failed" ? await latestReconciliationReport(prisma) : null;
    return NextResponse.json({ result, report }, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
