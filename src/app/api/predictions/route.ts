import { NextResponse } from "next/server";
import { listPredictions, placePrediction } from "@/server/betting/service";
import { parsePlaceRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const marketId = url.searchParams.get("marketId") ?? undefined;
    const walletAddress = url.searchParams.get("walletAddress") ?? undefined;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const predictions = await listPredictions({
      marketId: marketId || undefined,
      walletAddress: walletAddress || undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({ predictions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idempotencyKey = request.headers.get("idempotency-key");
    const input = parsePlaceRequest(body, idempotencyKey);
    const prediction = await placePrediction(input);
    return NextResponse.json({ prediction }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
