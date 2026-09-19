import "server-only";

import type { Market as MarketRow, PrismaClient } from "@prisma/client";
import { categoryColor, type Market as CatalogMarket } from "@/lib/markets";
import { parsePoolTokenId, poolBook } from "@/server/pools/book";
import { getPrisma } from "@/server/db";
import { normalizeCategory, VEYRA_POOL_SOURCE } from "@/server/voting/config";

/**
 * Veyra-native pools live in the database, not in the static catalog, so the
 * catalog lookup misses them. This maps a stored pool onto the shape the rest of
 * the app already speaks, which is what makes a pool created by a voting round
 * quotable and viewable rather than an unreachable row.
 *
 * A pool has no CLOB tokens, so it stays on the paper/synthetic book path and never
 * reaches live Polymarket execution.
 */
export function poolToCatalogMarket(row: MarketRow): CatalogMarket {
  const category = normalizeCategory(row.category);
  const yesChance = Math.round(row.yesPriceBps / 100);
  return {
    id: row.id,
    title: row.title,
    category,
    tag: row.tag,
    // Nothing is staked until the pool trades; never invent volume.
    staked: "$0",
    tables: 0,
    openSeats: row.accepting ? 1 : 0,
    resolvesIn: "",
    resolvesAt: row.resolvesAt ?? "",
    wagers: 0,
    status: row.status === "resolved" ? "resolved" : "new",
    accent: categoryColor(category),
    tableOptions: [],
    seats: [
      { id: "A", wallet: "Yes", avatar: `${row.id}-yes`, chance: yesChance, side: "lands" },
      { id: "B", wallet: "No", avatar: `${row.id}-no`, chance: 100 - yesChance, side: "misses" },
    ],
    volumeUsd: row.volumeUsd,
    liquidityUsd: row.liquidityUsd,
    live: false,
    source: VEYRA_POOL_SOURCE,
  };
}

/** Looks up a Veyra-native pool by id. Returns null for anything else. */
export async function getPoolMarket(
  id: string,
  prisma: PrismaClient = getPrisma(),
): Promise<CatalogMarket | null> {
  const row = await prisma.market.findFirst({ where: { id, source: VEYRA_POOL_SOURCE } });
  if (!row) return null;
  const proposer = await proposerForPool(id, prisma);
  return { ...poolToCatalogMarket(row), proposerWallet: proposer ?? undefined };
}

/** Wallet that proposed the question this pool was created from. */
export async function proposerForPool(marketId: string, prisma: PrismaClient = getPrisma()) {
  const row = await prisma.voteProposal.findFirst({
    where: { marketId },
    select: { proposerWallet: true },
  });
  return row?.proposerWallet.toLowerCase() ?? null;
}

/** Every open Veyra-native pool, newest first, for listing alongside the catalog. */
export async function listPoolMarkets(prisma: PrismaClient = getPrisma()): Promise<CatalogMarket[]> {
  const rows = await prisma.market.findMany({
    where: { source: VEYRA_POOL_SOURCE },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(poolToCatalogMarket);
}

/**
 * The paper order book for a Veyra pool's synthetic token.
 *
 * The catalog-backed lookup in `syntheticBookForToken` is synchronous and only
 * searches the static market list, so a pool's token resolves to nothing there and
 * execution fails with "No orderbook exists for the requested token id". Pools are
 * database rows, so their book needs this async lookup.
 */
export async function poolSyntheticBook(tokenId: string, prisma: PrismaClient = getPrisma()) {
  const parsed = parsePoolTokenId(tokenId);
  if (!parsed) return null;
  const pool = await getPoolMarket(parsed.marketId, prisma);
  if (!pool) return null;
  // A funded pool quotes its own AMM curve. An unfunded one is NOT quotable: it has
  // no counterparty, so any price would be fiction.
  return poolBook(prisma, parsed.marketId, parsed.outcome);
}
