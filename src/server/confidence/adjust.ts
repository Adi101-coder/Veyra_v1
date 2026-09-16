import type { ConfidenceEngineConfig } from "@/server/confidence/config";
import {
  edgeBps,
  limitPriceBps,
  rawKellyBps,
  sellLimitPriceBps,
  sizedKellyBps,
  sizedNotionalMicros,
} from "@/server/confidence/formula";
import type { EngineBook, EngineWalkFill } from "@/server/confidence/types";
import { floorToLot, SHARE_SCALE, sharesCostMicros } from "@/server/money";

export type HeldPosition = {
  sharesMicros: bigint;
  notionalMicros: bigint;
  avgPriceBps: number;
};

export type TargetPosition = {
  confidenceBps: number;
  marketPriceBps: number;
  edgeBps: number;
  kellyBps: number;
  sizedKellyBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  payoutMicros: bigint;
  flatten: boolean;
};

export type AdjustmentPlan = {
  side: "BUY" | "SELL" | "NONE";
  deltaSharesMicros: bigint;
  signedDeltaSharesMicros: bigint;
  limitPriceBps: number;
  notionalMicros: bigint;
  avgFillPriceBps: number;
  fills: EngineWalkFill[];
  target: TargetPosition;
  previous: HeldPosition;
};

function payoutFromShares(sharesMicros: bigint) {
  return (sharesMicros * 1_000_000n) / SHARE_SCALE;
}

export function targetPositionFromConfidence(
  confidenceBps: number,
  stakeMicros: bigint,
  marketPriceBps: number,
  config: ConfidenceEngineConfig,
): TargetPosition {
  const edge = edgeBps(confidenceBps, marketPriceBps);
  if (edge < config.minEdgeBps || marketPriceBps <= 0) {
    return {
      confidenceBps,
      marketPriceBps,
      edgeBps: edge,
      kellyBps: 0,
      sizedKellyBps: 0,
      sharesMicros: 0n,
      notionalMicros: 0n,
      payoutMicros: 0n,
      flatten: true,
    };
  }

  const kelly = rawKellyBps(confidenceBps, marketPriceBps);
  const sizedKelly = sizedKellyBps(kelly, config);
  const budget = sizedNotionalMicros(stakeMicros, sizedKelly);
  const rawShares = (budget * 10_000n) / BigInt(marketPriceBps);
  const sharesMicros = floorToLot(rawShares, config.shareLotMicros);
  const notionalMicros = sharesCostMicros(sharesMicros, marketPriceBps);

  return {
    confidenceBps,
    marketPriceBps,
    edgeBps: edge,
    kellyBps: kelly,
    sizedKellyBps: sizedKelly,
    sharesMicros,
    notionalMicros,
    payoutMicros: payoutFromShares(sharesMicros),
    flatten: false,
  };
}

export function walkAsksForShares(
  book: EngineBook,
  limitBps: number,
  sharesToBuy: bigint,
  lot: bigint,
): EngineWalkFill[] {
  const fills: EngineWalkFill[] = [];
  let remaining = sharesToBuy;
  const asks = [...book.asks].sort((a, b) => a.priceBps - b.priceBps);
  for (const level of asks) {
    if (remaining <= 0n) break;
    if (level.priceBps > limitBps || level.priceBps <= 0 || level.sizeMicros <= 0n) continue;
    const take = floorToLot(remaining < level.sizeMicros ? remaining : level.sizeMicros, lot);
    if (take <= 0n) continue;
    fills.push({
      priceBps: level.priceBps,
      sharesMicros: take,
      notionalMicros: sharesCostMicros(take, level.priceBps),
    });
    remaining -= take;
  }
  return fills;
}

export function walkBidsForShares(
  book: EngineBook,
  minPriceBps: number,
  sharesToSell: bigint,
  lot: bigint,
): EngineWalkFill[] {
  const fills: EngineWalkFill[] = [];
  let remaining = sharesToSell;
  const bids = [...book.bids].sort((a, b) => b.priceBps - a.priceBps);
  for (const level of bids) {
    if (remaining <= 0n) break;
    if (level.priceBps < minPriceBps || level.priceBps <= 0 || level.sizeMicros <= 0n) continue;
    const take = floorToLot(remaining < level.sizeMicros ? remaining : level.sizeMicros, lot);
    if (take <= 0n) continue;
    fills.push({
      priceBps: level.priceBps,
      sharesMicros: take,
      notionalMicros: sharesCostMicros(take, level.priceBps),
    });
    remaining -= take;
  }
  return fills;
}

function avgFill(fills: EngineWalkFill[]) {
  const shares = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  const cost = fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);
  if (shares <= 0n) return 0;
  return Number((cost * 10_000n) / shares);
}

export function planAdjustment(
  held: HeldPosition,
  target: TargetPosition,
  book: EngineBook,
  config: ConfidenceEngineConfig,
): AdjustmentPlan {
  const signed = target.sharesMicros - held.sharesMicros;
  const abs = signed < 0n ? -signed : signed;
  const lot = config.shareLotMicros;

  if (abs < lot) {
    return {
      side: "NONE",
      deltaSharesMicros: 0n,
      signedDeltaSharesMicros: 0n,
      limitPriceBps: target.marketPriceBps,
      notionalMicros: 0n,
      avgFillPriceBps: held.avgPriceBps,
      fills: [],
      target,
      previous: held,
    };
  }

  if (signed > 0n) {
    const bestAsk = [...book.asks].sort((a, b) => a.priceBps - b.priceBps)[0];
    const limit = bestAsk
      ? limitPriceBps(bestAsk.priceBps, target.confidenceBps, book.tickBps, config)
      : 0;
    const fills = walkAsksForShares(book, limit, abs, lot);
    const filled = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
    return {
      side: "BUY",
      deltaSharesMicros: filled,
      signedDeltaSharesMicros: filled,
      limitPriceBps: limit,
      notionalMicros: fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n),
      avgFillPriceBps: avgFill(fills),
      fills,
      target,
      previous: held,
    };
  }

  const bestBid = [...book.bids].sort((a, b) => b.priceBps - a.priceBps)[0];
  const limit = bestBid ? sellLimitPriceBps(bestBid.priceBps, book.tickBps, config) : 0;
  const fills = walkBidsForShares(book, limit, abs, lot);
  const filled = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  return {
    side: "SELL",
    deltaSharesMicros: filled,
    signedDeltaSharesMicros: -filled,
    limitPriceBps: limit,
    notionalMicros: fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n),
    avgFillPriceBps: avgFill(fills),
    fills,
    target,
    previous: held,
  };
}

export function isStalePrice(quotedBps: number | undefined, liveBps: number, maxStaleBps: number) {
  if (quotedBps == null) return false;
  return Math.abs(quotedBps - liveBps) > maxStaleBps;
}

export function applyFilledDelta(
  held: HeldPosition,
  side: "BUY" | "SELL",
  filledShares: bigint,
  filledNotional: bigint,
): HeldPosition {
  if (filledShares <= 0n) return held;
  if (side === "BUY") {
    const shares = held.sharesMicros + filledShares;
    const notional = held.notionalMicros + filledNotional;
    const avgPriceBps = shares > 0n ? Number((notional * 10_000n) / shares) : 0;
    return { sharesMicros: shares, notionalMicros: notional, avgPriceBps };
  }
  const shares = held.sharesMicros > filledShares ? held.sharesMicros - filledShares : 0n;
  const notional = sharesCostMicros(shares, held.avgPriceBps || 0);
  return { sharesMicros: shares, notionalMicros: notional, avgPriceBps: held.avgPriceBps };
}
