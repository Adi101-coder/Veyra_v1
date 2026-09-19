import { NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { jsonError } from "@/server/http";
import { currentRound } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The open round, its proposals and (when signed in) this wallet's votes. */
export async function GET(request: Request) {
  try {
    const wallet = sessionWallet(request) ?? undefined;
    return NextResponse.json(await currentRound(wallet));
  } catch (error) {
    return jsonError(error);
  }
}
