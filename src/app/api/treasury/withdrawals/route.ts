import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { BettingError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { requestWithdrawal } from "@/server/treasury/withdrawals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Queue a withdrawal. Funds are debited immediately; an operator sends USDC. */
export async function POST(request: Request) {
  try {
    const wallet = requireWallet(request);
    const body = (await request.json()) as Record<string, unknown>;
    const amountRaw = typeof body.amountMicros === "string" ? body.amountMicros.trim() : "";
    if (!/^\d+$/.test(amountRaw)) {
      throw new BettingError("INVALID_WITHDRAWAL", "amountMicros must be an integer string.", 400);
    }
    const dest = typeof body.destAddress === "string" ? body.destAddress : "";
    const row = await requestWithdrawal(getPrisma(), {
      walletAddress: wallet,
      destAddress: dest,
      amountMicros: BigInt(amountRaw),
    });
    return NextResponse.json({
      id: row.id,
      status: row.status,
      amountMicros: row.amountMicros.toString(),
      destAddress: row.destAddress,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const wallet = requireWallet(request);
    const rows = await getPrisma().treasuryWithdrawal.findMany({
      where: { walletAddress: wallet },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      withdrawals: rows.map((row) => ({
        id: row.id,
        status: row.status,
        amountMicros: row.amountMicros.toString(),
        destAddress: row.destAddress,
      txHash: row.txHash,
      errorMessage: row.errorMessage,
      manualOnly: row.manualOnly,
      createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
