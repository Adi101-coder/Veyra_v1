import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { voteForProposal } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Casting the same vote twice is a no-op, so retries are safe. */
export async function POST(request: Request) {
  try {
    const wallet = requireWallet(request);
    rateLimit(request, "voting-vote", 60, 60_000, wallet);
    const result = await voteForProposal(request, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
