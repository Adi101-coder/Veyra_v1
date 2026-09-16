import { NextResponse } from "next/server";
import { listUserPredictions } from "@/server/betting/service";
import { parseWalletAddress } from "@/server/betting/validation";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const wallet = parseWalletAddress(decodeURIComponent(id));
    const predictions = await listUserPredictions(wallet);
    return NextResponse.json({ predictions });
  } catch (error) {
    return jsonError(error);
  }
}
