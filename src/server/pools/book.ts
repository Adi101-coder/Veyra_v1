import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { OrderBookSnapshot, Outcome } from "@/lib/betting";
import { formatPrice, formatShares } from "@/server/money";
import { loadPoolConfig, type PoolConfig } from "@/server/pools/config";
import { poolLiquidity } from "@/server/pools/fund";
import {
  buildAskLadder,
  buildBidLadder,
  marginalPriceBps,
  type LadderOptions,
  type LmsrState,
} from "@/server/pools/lmsr";

/**
 * The order book a Veyra-native pool quotes, generated from its LMSR curve.
 *
 * Producing a real book (rather than pricing specially) means the existing engine,
 * executor and ledger work on pools unchanged: they walk levels exactly as they do
 * for a venue book, and the AMM's slippage is expressed in the ladder.
 */

export type PoolInventory = { qYesMicros: bigint; qNoMicros: bigint };

/**
 * Shares outstanding per side, derived from the ledger rather than stored.
 *
 * Position rows change only from recorded fills and are already net of sells
 * (Change Your Mind sells shares back, which genuinely reduces what the pool is
 * short), so summing them gives the AMM's true inventory.
 *
 * Note this deliberately counts simulated fills. Pool trading is paper today, so
 * every pool fill is `isSimulated: true` — the opposite of `inventory/reconcile.ts`,
 * which scopes to non-simulated fills because it reconciles against a real venue
 * wallet. Same column, two opposite and correct meanings.
 */
export async function poolInventory(prisma: PrismaClient, marketId: string): Promise<PoolInventory> {
  const rows = await prisma.position.groupBy({
    by: ["outcome"],
    where: { marketId },
    _sum: { sharesMicros: true },
  });
  const find = (outcome: Outcome) =>
    rows.find((row) => row.outcome === outcome)?._sum.sharesMicros ?? 0n;
  // Clamp: inventory can never be negative, whatever the ledger says.
  const qYesMicros = find("YES") > 0n ? find("YES") : 0n;
  const qNoMicros = find("NO") > 0n ? find("NO") : 0n;
  return { qYesMicros, qNoMicros };
}

export async function poolState(
  prisma: PrismaClient,
  marketId: string,
): Promise<LmsrState | null> {
  const liquidity = await poolLiquidity(prisma, marketId);
  if (!liquidity || liquidity.status !== "ACTIVE") return null;
  const inventory = await poolInventory(prisma, marketId);
  return { bMicros: liquidity.bMicros, ...inventory };
}

const ladderOptions = (config: PoolConfig): LadderOptions => ({
  lotMicros: config.lotMicros,
  tickBps: config.tickBps,
  maxLevels: config.maxLevels,
});

/**
 * The pool's book for one outcome, or null when the pool has no liquidity.
 *
 * Null means "not quotable". Callers must surface that rather than substituting a
 * default book: an unfunded pool has no counterparty, so any price it shows is
 * fiction.
 */
export async function poolBook(
  prisma: PrismaClient,
  marketId: string,
  outcome: Outcome,
  config: PoolConfig = loadPoolConfig(),
): Promise<OrderBookSnapshot | null> {
  const state = await poolState(prisma, marketId);
  if (!state) return null;

  const options = ladderOptions(config);
  const asks = buildAskLadder(state, outcome, options);
  const bids = buildBidLadder(state, outcome, options);
  const tickSize = (config.tickBps / 10_000).toFixed(4);

  return {
    tokenId: poolTokenId(marketId, outcome),
    timestamp: String(Date.now()),
    hash: `veyra-pool:${marketId}:${outcome}:${state.qYesMicros}:${state.qNoMicros}`,
    // A book is quoted best-price-first on each side.
    asks: asks.map((level) => ({
      price: formatPrice(level.priceBps),
      size: formatShares(level.sharesMicros),
    })),
    bids: bids.map((level) => ({
      price: formatPrice(level.priceBps),
      size: formatShares(level.sharesMicros),
    })),
    minOrderSize: formatShares(config.lotMicros),
    tickSize,
    negRisk: false,
    lastTradePrice: formatPrice(marginalPriceBps(state, outcome)),
    source: "pool",
  };
}

export function poolTokenId(marketId: string, outcome: Outcome) {
  return `synthetic:${marketId}:${outcome}`;
}

/** Parses a pool token id back to its market and outcome. */
export function parsePoolTokenId(tokenId: string) {
  const match = /^synthetic:(.+):(YES|NO)$/.exec(tokenId);
  if (!match) return null;
  return { marketId: match[1]!, outcome: match[2] as Outcome };
}
