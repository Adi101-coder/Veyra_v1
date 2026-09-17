import { NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ walletAddress: sessionWallet(request) });
}
