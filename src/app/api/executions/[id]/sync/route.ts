import { NextResponse } from "next/server";
import { syncExecution } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const prediction = await syncExecution(id);
    return NextResponse.json({ prediction });
  } catch (error) {
    return jsonError(error);
  }
}
