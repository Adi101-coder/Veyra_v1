import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { balancesFor } from "@/server/treasury/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in wallet's custodial deposit balances. */
export async function GET(request: Request) {
  try {
    const wallet = requireWallet(request);
    return NextResponse.json({ walletAddress: wallet, balances: await balancesFor(getPrisma(), wallet) });
  } catch (error) {
    return jsonError(error);
  }
}
