import { NextResponse } from "next/server";
import { changeConfidence } from "@/server/betting/service";
import { parseChangeConfidenceRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { requireWallet } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const wallet = requireWallet(request);
    rateLimit(request, "confidence", 30, 60_000, wallet);
    const body = await request.json();
    const input = parseChangeConfidenceRequest(body, request.headers.get("idempotency-key"), wallet);
    const result = await changeConfidence(id, input);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
