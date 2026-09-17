import { NextResponse } from "next/server";
import { quotePrediction } from "@/server/betting/service";
import { parseQuoteRequest } from "@/server/betting/validation";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rateLimit(request, "quote", 120, 60_000);
    const body = await request.json();
    const quote = await quotePrediction(parseQuoteRequest(body));
    return NextResponse.json({ quote });
  } catch (error) {
    return jsonError(error);
  }
}
