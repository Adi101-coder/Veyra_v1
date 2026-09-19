import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { parseWalletAddress } from "@/server/betting/validation";
import { getPrisma } from "@/server/db";
import { BettingError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { creditDeposit } from "@/server/treasury/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a confirmed on-chain deposit into the treasury wallet. Operator-only:
 * crediting is driven by a trusted watcher that has already confirmed the transfer,
 * never by the depositing user. Replaying the same (chainId, txHash, logIndex)
 * credits exactly once.
 */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const amountRaw = typeof body.amountBase === "string" ? body.amountBase.trim() : "";
    if (!/^\d+$/.test(amountRaw)) {
      throw new BettingError("INVALID_DEPOSIT", "amountBase must be an integer string in the asset's base units.", 400);
    }
    const result = await creditDeposit(getPrisma(), {
      walletAddress: parseWalletAddress(body.walletAddress),
      asset: String(body.asset ?? ""),
      chainId: Number(body.chainId),
      txHash: String(body.txHash ?? ""),
      logIndex: Number(body.logIndex ?? 0),
      amountBase: BigInt(amountRaw),
    });
    return NextResponse.json({
      credited: result.credited,
      depositId: result.depositId,
      balanceBase: result.balanceBase.toString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
