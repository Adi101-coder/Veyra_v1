import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { proposeQuestion } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const wallet = requireWallet(request);
    rateLimit(request, "voting-propose", 10, 60_000, wallet);
    const proposal = await proposeQuestion(request, await request.json());
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
