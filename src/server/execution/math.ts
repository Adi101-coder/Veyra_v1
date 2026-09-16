import type { OrderBookSnapshot } from "@/lib/betting";
import { snapshotToEngineBook } from "@/server/confidence/book";
import { walkAsksForShares, walkBidsForShares } from "@/server/confidence/adjust";
import type { EngineBook, EngineWalkFill } from "@/server/confidence/types";
import {
  floorToLot,
  floorToTick,
  parseSharesMicros,
  sharesCostMicros,
  tickBpsFromSize,
} from "@/server/money";
import type { ExecutionEngineConfig } from "@/server/execution/config";
import type {
  BookQuality,
  ExecutionIntentRow,
  ExecutionSide,
  ExecutionStrategy,
  InternalMatch,
  IntentAllocation,
  StrategySlice,
} from "@/server/execution/types";

export function toEngineBook(snapshot: OrderBookSnapshot): EngineBook {
  return snapshotToEngineBook(snapshot);
}

export function analyzeBook(
  snapshot: OrderBookSnapshot,
  now = Date.now(),
  maxAgeMs = 15_000,
): BookQuality {
  const book = snapshotToEngineBook(snapshot);
  const bestBid = book.bids[0]?.priceBps ?? null;
  const bestAsk = book.asks[0]?.priceBps ?? null;
  const midBps =
    bestBid != null && bestAsk != null ? Math.round((bestBid + bestAsk) / 2) : (bestAsk ?? bestBid);
  const timestampMs = snapshot.timestamp ? Number(snapshot.timestamp) : NaN;
  const ageMs = Number.isFinite(timestampMs) && timestampMs > 1_000_000_000_000 ? now - timestampMs : 0;
  return {
    tokenId: snapshot.tokenId,
    bestBidBps: bestBid,
    bestAskBps: bestAsk,
    midBps,
    spreadBps: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
    bidDepthMicros: book.bids.reduce((sum, level) => sum + level.sizeMicros, 0n),
    askDepthMicros: book.asks.reduce((sum, level) => sum + level.sizeMicros, 0n),
    minOrderSizeMicros: book.minSharesMicros,
    tickBps: book.tickBps,
    hash: snapshot.hash,
    timestamp: snapshot.timestamp,
    stale: ageMs > maxAgeMs,
  };
}

export function isStaleQuotedPrice(quotedBps: number | undefined, liveBps: number, maxStaleBps: number) {
  if (quotedBps == null) return false;
  return Math.abs(quotedBps - liveBps) > maxStaleBps;
}

export function walkSide(
  snapshot: OrderBookSnapshot,
  side: ExecutionSide,
  limitPriceBps: number,
  sharesMicros: bigint,
  lot: bigint,
): EngineWalkFill[] {
  const book = snapshotToEngineBook(snapshot);
  return side === "BUY"
    ? walkAsksForShares(book, limitPriceBps, sharesMicros, lot)
    : walkBidsForShares(book, limitPriceBps, sharesMicros, lot);
}

export function vwapBps(fills: EngineWalkFill[]) {
  const shares = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  const cost = fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);
  if (shares <= 0n) return 0;
  return Number((cost * 10_000n) / shares);
}

export function filledShares(fills: EngineWalkFill[]) {
  return fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
}

export function slippageBps(side: ExecutionSide, arrivalBps: number, avgBps: number) {
  if (!arrivalBps || !avgBps) return 0;
  return side === "BUY" ? avgBps - arrivalBps : arrivalBps - avgBps;
}

export function arrivalBps(quality: BookQuality, side: ExecutionSide) {
  if (side === "BUY") return quality.bestAskBps ?? quality.midBps ?? 0;
  return quality.bestBidBps ?? quality.midBps ?? 0;
}

export function feeOnNotional(notionalMicros: bigint, takerFeeBps: number) {
  if (takerFeeBps <= 0) return 0n;
  return (notionalMicros * BigInt(takerFeeBps)) / 10_000n;
}

export function expectedWalk(
  snapshot: OrderBookSnapshot,
  side: ExecutionSide,
  limitPriceBps: number,
  sharesMicros: bigint,
  lot: bigint,
) {
  const fills = walkSide(snapshot, side, limitPriceBps, sharesMicros, lot);
  const quality = analyzeBook(snapshot);
  const avg = vwapBps(fills);
  return {
    fills,
    sharesMicros: filledShares(fills),
    notionalMicros: fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n),
    avgPriceBps: avg,
    expectedSlippageBps: slippageBps(side, arrivalBps(quality, side), avg),
  };
}

export type WorkingIntent = {
  row: ExecutionIntentRow;
  remaining: bigint;
};

export function crossIntents(
  intents: ExecutionIntentRow[],
  quality: BookQuality,
): { matches: InternalMatch[]; residual: WorkingIntent[] } {
  const buys: WorkingIntent[] = intents
    .filter((row) => row.side === "BUY")
    .sort((a, b) => b.limitPriceBps - a.limitPriceBps)
    .map((row) => ({ row, remaining: row.sharesMicros }));
  const sells: WorkingIntent[] = intents
    .filter((row) => row.side === "SELL")
    .sort((a, b) => a.limitPriceBps - b.limitPriceBps)
    .map((row) => ({ row, remaining: row.sharesMicros }));

  const matches: InternalMatch[] = [];
  let bi = 0;
  let si = 0;
  const tick = quality.tickBps || 100;
  const mid = quality.midBps ?? 0;

  while (bi < buys.length && si < sells.length) {
    const buy = buys[bi]!;
    const sell = sells[si]!;
    if (buy.remaining <= 0n) {
      bi += 1;
      continue;
    }
    if (sell.remaining <= 0n) {
      si += 1;
      continue;
    }
    if (buy.row.limitPriceBps < sell.row.limitPriceBps) break;
    const take = buy.remaining < sell.remaining ? buy.remaining : sell.remaining;
    let price = mid;
    if (price < sell.row.limitPriceBps || price > buy.row.limitPriceBps) {
      price = Math.floor((buy.row.limitPriceBps + sell.row.limitPriceBps) / 2);
    }
    price = floorToTick(price, tick);
    if (price < sell.row.limitPriceBps) price = sell.row.limitPriceBps;
    if (price > buy.row.limitPriceBps) price = buy.row.limitPriceBps;
    matches.push({
      buyIntentId: buy.row.id,
      sellIntentId: sell.row.id,
      sharesMicros: take,
      priceBps: price,
      notionalMicros: sharesCostMicros(take, price),
    });
    buy.remaining -= take;
    sell.remaining -= take;
  }

  return { matches, residual: [...buys, ...sells].filter((item) => item.remaining > 0n) };
}

export function netResidual(residual: WorkingIntent[]): {
  side: ExecutionSide | "NONE";
  sharesMicros: bigint;
  limitPriceBps: number;
} {
  const buy = residual.filter((item) => item.row.side === "BUY");
  const sell = residual.filter((item) => item.row.side === "SELL");
  const buyShares = buy.reduce((sum, item) => sum + item.remaining, 0n);
  const sellShares = sell.reduce((sum, item) => sum + item.remaining, 0n);
  if (buyShares === 0n && sellShares === 0n) return { side: "NONE", sharesMicros: 0n, limitPriceBps: 0 };
  if (buyShares >= sellShares) {
    const limit = buy.reduce((min, item) => Math.min(min, item.row.limitPriceBps), Number.POSITIVE_INFINITY);
    return { side: "BUY", sharesMicros: buyShares, limitPriceBps: Number.isFinite(limit) ? limit : 0 };
  }
  const limit = sell.reduce((max, item) => Math.max(max, item.row.limitPriceBps), 0);
  return { side: "SELL", sharesMicros: sellShares, limitPriceBps: limit };
}

export function independentExpectedSlippage(
  intents: ExecutionIntentRow[],
  snapshot: OrderBookSnapshot,
  lot: bigint,
) {
  const levels = snapshotToEngineBook(snapshot);
  const asks = levels.asks.map((level) => ({ ...level }));
  const bids = levels.bids.map((level) => ({ ...level }));
  let weighted = 0;
  let total = 0n;

  for (const intent of intents) {
    const book: EngineBook = { ...levels, asks, bids };
    const fills =
      intent.side === "BUY"
        ? walkAsksForShares(book, intent.limitPriceBps, intent.sharesMicros, lot)
        : walkBidsForShares(book, intent.limitPriceBps, intent.sharesMicros, lot);
    consume(intent.side === "BUY" ? asks : bids, fills);
    const avg = vwapBps(fills);
    const touch =
      intent.side === "BUY" ? (levels.asks[0]?.priceBps ?? avg) : (levels.bids[0]?.priceBps ?? avg);
    const slip = slippageBps(intent.side, touch, avg);
    weighted += slip * Number(intent.sharesMicros);
    total += intent.sharesMicros;
  }

  if (total <= 0n) return 0;
  return Math.round(weighted / Number(total));
}

function consume(levels: { priceBps: number; sizeMicros: bigint }[], fills: EngineWalkFill[]) {
  for (const fill of fills) {
    let leftover = fill.sharesMicros;
    for (const level of levels) {
      if (leftover <= 0n) break;
      if (level.priceBps !== fill.priceBps || level.sizeMicros <= 0n) continue;
      const take = leftover < level.sizeMicros ? leftover : level.sizeMicros;
      level.sizeMicros -= take;
      leftover -= take;
    }
  }
}

export function planSlices(
  snapshot: OrderBookSnapshot,
  side: ExecutionSide,
  sharesMicros: bigint,
  limitPriceBps: number,
  config: ExecutionEngineConfig,
): { slices: StrategySlice[]; walk: EngineWalkFill[]; notes: string[] } {
  const notes: string[] = [];
  const quality = analyzeBook(snapshot);
  const lot = config.shareLotMicros;
  const min = quality.minOrderSizeMicros > 0n ? quality.minOrderSizeMicros : lot;
  const walk = walkSide(snapshot, side, limitPriceBps, sharesMicros, lot);
  const walkable = filledShares(walk);

  if (walkable <= 0n) {
    notes.push("Book has no executable depth inside the limit.");
    return { slices: [], walk, notes };
  }
  if (walkable < min) {
    notes.push("Net size is below the venue minimum order size.");
    return { slices: [], walk, notes };
  }

  const depthAtTouch =
    side === "BUY"
      ? snapshotToEngineBook(snapshot).asks[0]?.sizeMicros ?? 0n
      : snapshotToEngineBook(snapshot).bids[0]?.sizeMicros ?? 0n;

  if (walkable <= depthAtTouch || walk.length === 1) {
    notes.push("Single-touch or single-level book; one venue order.");
    return {
      slices: [
        {
          side,
          sharesMicros: walkable,
          notionalMicros: walk.reduce((sum, fill) => sum + fill.notionalMicros, 0n),
          limitPriceBps,
          reason: "single_touch",
        },
      ],
      walk,
      notes,
    };
  }

  if (walkable > config.maxSliceSharesMicros && config.maxSliceSharesMicros >= min) {
    notes.push("Splitting because net size exceeds the configured max slice.");
    return { slices: chunkWalk(walk, side, config.maxSliceSharesMicros, min), walk, notes };
  }

  notes.push("Splitting across book levels so a later-level miss keeps earlier fills.");
  const slices: StrategySlice[] = walk
    .filter((fill) => fill.sharesMicros >= min || walk.length === 1)
    .map((fill) => ({
      side,
      sharesMicros: fill.sharesMicros,
      notionalMicros: fill.notionalMicros,
      limitPriceBps: fill.priceBps,
      reason: "depth_split" as const,
    }));
  if (!slices.length) {
    return {
      slices: [
        {
          side,
          sharesMicros: walkable,
          notionalMicros: walk.reduce((sum, fill) => sum + fill.notionalMicros, 0n),
          limitPriceBps,
          reason: "residual",
        },
      ],
      walk,
      notes,
    };
  }
  return { slices, walk, notes };
}

function chunkWalk(
  walk: EngineWalkFill[],
  side: ExecutionSide,
  maxSlice: bigint,
  min: bigint,
): StrategySlice[] {
  const slices: StrategySlice[] = [];
  let accShares = 0n;
  let accNotional = 0n;
  let limit = 0;
  const flush = (reason: StrategySlice["reason"]) => {
    if (accShares <= 0n) return;
    slices.push({
      side,
      sharesMicros: accShares,
      notionalMicros: accNotional,
      limitPriceBps: limit,
      reason,
    });
    accShares = 0n;
    accNotional = 0n;
  };
  for (const fill of walk) {
    let leftover = fill.sharesMicros;
    while (leftover > 0n) {
      const room = maxSlice - accShares;
      const take = leftover < room ? leftover : room;
      accShares += take;
      accNotional += sharesCostMicros(take, fill.priceBps);
      limit = fill.priceBps;
      leftover -= take;
      if (accShares >= maxSlice && accShares >= min) flush("max_slice");
    }
  }
  flush("residual");
  return slices;
}

export function buildStrategy(
  intents: ExecutionIntentRow[],
  snapshot: OrderBookSnapshot,
  config: ExecutionEngineConfig,
): ExecutionStrategy & { matches: InternalMatch[]; residual: WorkingIntent[] } {
  const quality = analyzeBook(snapshot, Date.now(), config.maxBookAgeMs);
  const { matches, residual } = crossIntents(intents, quality);
  const net = netResidual(residual);
  const internalShares = matches.reduce((sum, match) => sum + match.sharesMicros, 0n);
  const independent = independentExpectedSlippage(intents, snapshot, config.shareLotMicros);

  if (net.side === "NONE") {
    return {
      netSide: "NONE",
      netSharesMicros: 0n,
      internalSharesMicros: internalShares,
      venueSharesMicros: 0n,
      slices: [],
      quality,
      expectedVenueAvgBps: quality.midBps ?? 0,
      expectedSlippageBps: 0,
      independentExpectedSlippageBps: independent,
      notes: ["Fully internalized; no venue order."],
      matches,
      residual,
    };
  }

  const planned = planSlices(snapshot, net.side, net.sharesMicros, net.limitPriceBps, config);
  const venueShares = planned.slices.reduce((sum, slice) => sum + slice.sharesMicros, 0n);
  const expectedAvg = vwapBps(planned.walk);
  return {
    netSide: net.side,
    netSharesMicros: net.sharesMicros,
    internalSharesMicros: internalShares,
    venueSharesMicros: venueShares,
    slices: planned.slices,
    quality,
    expectedVenueAvgBps: expectedAvg,
    expectedSlippageBps: slippageBps(net.side, arrivalBps(quality, net.side), expectedAvg),
    independentExpectedSlippageBps: independent,
    notes: planned.notes,
    matches,
    residual,
  };
}

export function allocateFills(
  intents: ExecutionIntentRow[],
  matches: InternalMatch[],
  residual: WorkingIntent[],
  venueFills: Array<EngineWalkFill & { feeMicros?: bigint; venueTradeId?: string; simulated?: boolean }>,
  simulated: boolean,
): IntentAllocation[] {
  const buckets = new Map<string, IntentAllocation>();
  for (const intent of intents) {
    buckets.set(intent.id, {
      intentId: intent.id,
      executionId: intent.executionId,
      status: "failed",
      fills: [],
      executedSharesMicros: 0n,
      executedNotionalMicros: 0n,
      avgPriceBps: 0,
      feeMicros: 0n,
    });
  }

  const push = (
    intentId: string,
    fill: EngineWalkFill,
    extra: { feeMicros: bigint; venueTradeId: string; simulated: boolean },
  ) => {
    const bucket = buckets.get(intentId);
    if (!bucket) return;
    bucket.fills.push({ ...fill, ...extra });
    bucket.executedSharesMicros += fill.sharesMicros;
    bucket.executedNotionalMicros += fill.notionalMicros;
    bucket.feeMicros += extra.feeMicros;
  };

  for (const match of matches) {
    const fill = {
      priceBps: match.priceBps,
      sharesMicros: match.sharesMicros,
      notionalMicros: match.notionalMicros,
    };
    push(match.buyIntentId, fill, {
      feeMicros: 0n,
      venueTradeId: `internal-${match.buyIntentId}`,
      simulated: false,
    });
    push(match.sellIntentId, fill, {
      feeMicros: 0n,
      venueTradeId: `internal-${match.sellIntentId}`,
      simulated: false,
    });
  }

  const leftover = residual.map((item) => ({ id: item.row.id, remaining: item.remaining }));
  const totalResidual = leftover.reduce((sum, item) => sum + item.remaining, 0n);
  const venuePool = venueFills.map((fill) => ({ ...fill }));
  const venueTotal = filledShares(venuePool);
  let venueLeft = venueTotal;

  for (let i = 0; i < leftover.length; i += 1) {
    const item = leftover[i]!;
    if (totalResidual <= 0n || venueLeft <= 0n) break;
    const share =
      i === leftover.length - 1 ? venueLeft : (item.remaining * venueTotal) / totalResidual;
    const take = share < item.remaining ? share : item.remaining;
    const sized = take < venueLeft ? take : venueLeft;
    if (sized <= 0n) continue;
    const piece = takeFromFills(venuePool, sized);
    for (const fill of piece) {
      push(item.id, fill, {
        feeMicros: fill.feeMicros ?? 0n,
        venueTradeId: fill.venueTradeId ?? `venue-${item.id}`,
        simulated: fill.simulated ?? simulated,
      });
    }
    venueLeft -= sized;
    item.remaining -= sized;
  }

  for (const intent of intents) {
    const bucket = buckets.get(intent.id)!;
    bucket.avgPriceBps = vwapBps(bucket.fills);
    if (bucket.executedSharesMicros >= intent.sharesMicros) bucket.status = "filled";
    else if (bucket.executedSharesMicros > 0n) bucket.status = "partial";
    else {
      bucket.status = "failed";
      bucket.errorCode = "UNFILLED";
      bucket.errorMessage = "No shares were allocated after aggregation.";
    }
  }

  return [...buckets.values()];
}

function takeFromFills(
  fills: Array<EngineWalkFill & { feeMicros?: bigint; venueTradeId?: string; simulated?: boolean }>,
  sharesMicros: bigint,
) {
  const out: Array<EngineWalkFill & { feeMicros?: bigint; venueTradeId?: string; simulated?: boolean }> = [];
  let remaining = sharesMicros;
  for (const fill of fills) {
    if (remaining <= 0n || fill.sharesMicros <= 0n) continue;
    const take = remaining < fill.sharesMicros ? remaining : fill.sharesMicros;
    const notional = sharesCostMicros(take, fill.priceBps);
    const fee =
      fill.sharesMicros > 0n && fill.feeMicros
        ? (fill.feeMicros * take) / fill.sharesMicros
        : 0n;
    out.push({
      ...fill,
      sharesMicros: take,
      notionalMicros: notional,
      feeMicros: fee,
    });
    fill.sharesMicros -= take;
    fill.notionalMicros -= notional;
    if (fill.feeMicros) fill.feeMicros -= fee;
    remaining -= take;
  }
  return out;
}

export function parseMinShares(snapshot: OrderBookSnapshot) {
  try {
    return parseSharesMicros(snapshot.minOrderSize || "1", "floor");
  } catch {
    return 1_000_000n;
  }
}

export function floorLot(amount: bigint, lot: bigint) {
  return floorToLot(amount, lot);
}
