import { NextResponse } from "next/server";
import { closePosition } from "@/server/betting/service";
import { parseClosePositionRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { requireWallet } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const wallet = requireWallet(request);
    rateLimit(request, "confidence", 30, 60_000, wallet);
    const body = await request.json().catch(() => ({}));
    const input = parseClosePositionRequest(body, request.headers.get("idempotency-key"), wallet);
    const result = await closePosition(id, input);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
