import { NextResponse } from "next/server";
import { listPredictions } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get("walletAddress") ?? undefined;
    const marketId = url.searchParams.get("marketId") ?? undefined;
    const predictions = await listPredictions({ walletAddress, marketId, limit: 100 });
    const positions = predictions
      .map((prediction) => prediction.position)
      .filter((position): position is NonNullable<typeof position> => Boolean(position));
    return NextResponse.json({ positions, predictions });
  } catch (error) {
    return jsonError(error);
  }
}
