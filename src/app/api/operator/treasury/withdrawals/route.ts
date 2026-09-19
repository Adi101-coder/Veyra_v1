import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { BettingError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { completeWithdrawal, failWithdrawal, listPendingWithdrawals } from "@/server/treasury/withdrawals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual withdrawal queue. The server never holds a treasury spending key. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    const rows = await listPendingWithdrawals(getPrisma());
    return NextResponse.json({
      withdrawals: rows.map((row) => ({
        id: row.id,
        walletAddress: row.walletAddress,
        destAddress: row.destAddress,
        amountMicros: row.amountMicros.toString(),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new BettingError("INVALID_WITHDRAWAL", "id is required.", 400);
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "complete") {
      const txHash = typeof body.txHash === "string" ? body.txHash : "";
      const row = await completeWithdrawal(getPrisma(), { id, txHash });
      return NextResponse.json({ id: row.id, status: row.status, txHash: row.txHash });
    }
    if (action === "fail") {
      const row = await failWithdrawal(getPrisma(), {
        id,
        errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
      });
      return NextResponse.json({ id: row.id, status: row.status });
    }
    throw new BettingError("INVALID_WITHDRAWAL", "action must be complete or fail.", 400);
  } catch (error) {
    return jsonError(error);
  }
}
