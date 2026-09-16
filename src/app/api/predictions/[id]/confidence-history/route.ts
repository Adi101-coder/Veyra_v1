import { NextResponse } from "next/server";
import { listConfidenceHistory } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const history = await listConfidenceHistory(id);
    return NextResponse.json({ history });
  } catch (error) {
    return jsonError(error);
  }
}
