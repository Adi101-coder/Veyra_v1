import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { readinessReport } from "@/server/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator launch/readiness report. 200 when ready, 503 otherwise. Never returns secrets. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    const report = await readinessReport(getPrisma());
    return NextResponse.json(report, { status: report.ready ? 200 : 503 });
  } catch (error) {
    return jsonError(error);
  }
}
