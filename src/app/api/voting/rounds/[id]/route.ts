import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { roundHistory } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Frozen result of a round: the audit trail behind its five pools. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await roundHistory(id));
  } catch (error) {
    return jsonError(error);
  }
}
