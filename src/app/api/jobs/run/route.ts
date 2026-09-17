import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { runWorkerTick } from "@/server/worker";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator/cron: one pass of every background job (see src/server/worker.ts). */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    return NextResponse.json(await runWorkerTick());
  } catch (error) {
    return jsonError(error);
  }
}
