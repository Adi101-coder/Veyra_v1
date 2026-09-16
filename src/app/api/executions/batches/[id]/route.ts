import { NextResponse } from "next/server";
import { getExecutionBatch } from "@/server/betting/service";
import { toExecutionBatchDTO } from "@/server/betting/mapper";
import { jsonError } from "@/server/http";
import { BettingError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const batch = await getExecutionBatch(id);
    if (!batch) throw new BettingError("NOT_FOUND", "Execution batch not found.", 404);
    return NextResponse.json({ batch: toExecutionBatchDTO(batch) });
  } catch (error) {
    return jsonError(error);
  }
}
