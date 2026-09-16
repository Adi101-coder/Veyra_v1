import { NextResponse } from "next/server";
import { getPrediction } from "@/server/betting/service";
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
    const prediction = await getPrediction(id);
    if (!prediction) {
      throw new BettingError("NOT_FOUND", "Prediction not found.", 404);
    }
    return NextResponse.json({ prediction });
  } catch (error) {
    return jsonError(error);
  }
}
