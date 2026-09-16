import { NextResponse } from "next/server";
import { parseOutcome } from "@/server/betting/validation";
import { resolveMarket } from "@/server/betting/service";
import { createDefaultDeps } from "@/server/betting/service";
import { syntheticBookFromMarket, tokenIdFor } from "@/server/confidence/book";
import { fetchClobBook } from "@/server/polymarket/clob";
import { jsonError } from "@/server/http";
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
    const book = tokenId
      ? await fetchClobBook(tokenId).catch(() => syntheticBookFromMarket(market, outcome))
      : syntheticBookFromMarket(market, outcome);
    return NextResponse.json({ marketId: market.id, outcome, book });
  } catch (error) {
    return jsonError(error);
  }
}
