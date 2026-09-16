import { NextResponse } from "next/server";
import { flushExecutions } from "@/server/betting/service";
import { toExecutionBatchDTO } from "@/server/betting/mapper";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const batches = await flushExecutions();
    return NextResponse.json({ batches: batches.map((row) => toExecutionBatchDTO(row.batch)) });
  } catch (error) {
    return jsonError(error);
  }
}
