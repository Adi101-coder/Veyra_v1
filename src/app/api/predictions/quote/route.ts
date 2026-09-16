import { NextResponse } from "next/server";
import { quotePrediction } from "@/server/betting/service";
import { parseQuoteRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quote = await quotePrediction(parseQuoteRequest(body));
    return NextResponse.json({ quote });
  } catch (error) {
    return jsonError(error);
  }
}
