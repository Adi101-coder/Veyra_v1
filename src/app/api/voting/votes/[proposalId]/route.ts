import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { retractVoteForProposal } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Take back a vote cast in the open round. Retries are safe. */
export async function DELETE(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    const wallet = requireWallet(request);
    rateLimit(request, "voting-unvote", 60, 60_000, wallet);
    const { proposalId } = await context.params;
    return NextResponse.json(await retractVoteForProposal(request, proposalId));
  } catch (error) {
    return jsonError(error);
  }
}
