import { NextResponse } from "next/server";
import { parseOutcome } from "@/server/betting/validation";
import { resolveMarket } from "@/server/betting/service";
import { createDefaultDeps } from "@/server/betting/service";
import { syntheticBookFromMarket, tokenIdFor } from "@/server/confidence/book";
import { fetchClobBook } from "@/server/polymarket/clob";
import { jsonError } from "@/server/http";
import { getPrisma } from "@/server/db";
import { poolBook } from "@/server/pools/book";
import { VEYRA_POOL_SOURCE } from "@/server/voting/config";
import { BettingError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const outcome = parseOutcome(new URL(request.url).searchParams.get("outcome") ?? "YES");
    const market = await resolveMarket(id, createDefaultDeps());
    if (!market) throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
    const tokenId = tokenIdFor(market, outcome);
    let book;
    if (tokenId) {
      book = await fetchClobBook(tokenId).catch(() => syntheticBookFromMarket(market, outcome));
    } else if (market.source === VEYRA_POOL_SOURCE) {
      // A Veyra pool quotes its own AMM ladder. Unfunded, it has no counterparty,
      // so it must report that rather than show an invented 50/50 book.
      const pool = await poolBook(getPrisma(), market.id, outcome);
      if (!pool) {
        throw new BettingError(
          "POOL_NOT_FUNDED",
          "This pool has no liquidity yet. It opens once the liquidity fund can cover it.",
          409,
        );
      }
      book = pool;
    } else {
      book = syntheticBookFromMarket(market, outcome);
    }
    return NextResponse.json({ marketId: market.id, outcome, book });
  } catch (error) {
    return jsonError(error);
  }
}
