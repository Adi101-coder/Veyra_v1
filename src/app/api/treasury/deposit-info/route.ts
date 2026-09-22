import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { loadSupportedAssets, treasuryAddress } from "@/server/treasury/config";
import { CASH_ASSET } from "@/server/treasury/funds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where to deposit, and what is accepted.
 *
 * Public on purpose: the treasury address is watch-only and already visible
 * on-chain, and a user cannot deposit without it. Nothing here is a secret, and
 * without it the deposit flow has no entry point at all.
 *
 * Only listed assets are credited — the watcher scans exactly these contracts —
 * so the list is the honest answer to "what can I send", and `cashAsset` marks
 * the one a balance can actually be bet with.
 */
export async function GET() {
  try {
    const address = treasuryAddress();
    const assets = loadSupportedAssets().map((asset) => ({
      symbol: asset.symbol,
      contract: asset.contract,
      chainId: asset.chainId,
      decimals: asset.decimals,
      isCashAsset: asset.symbol === CASH_ASSET,
    }));
    return NextResponse.json({
      treasuryAddress: address,
      cashAsset: CASH_ASSET,
      assets,
      // Deposits are credited from confirmed Transfer logs, so anything sent
      // outside this list (native coin included) arrives but is never credited.
      acceptsDeposits: Boolean(address) && assets.length > 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
