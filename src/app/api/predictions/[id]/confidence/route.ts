import { NextResponse } from "next/server";
import { changeConfidence } from "@/server/betting/service";
import { parseChangeConfidenceRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseChangeConfidenceRequest(body, request.headers.get("idempotency-key"));
    const result = await changeConfidence(id, input);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
