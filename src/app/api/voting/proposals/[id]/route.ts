import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { removeProposal } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The proposer pulls their own question. Votes on it are released. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const wallet = requireWallet(request);
    rateLimit(request, "voting-remove", 20, 60_000, wallet);
    const { id } = await context.params;
    return NextResponse.json(await removeProposal(request, id));
  } catch (error) {
    return jsonError(error);
  }
}
