import type { Outcome } from "@/lib/betting";

/**
 * LMSR (Hanson's logarithmic market scoring rule) pricing for Veyra-native pools.
 *
 * Veyra is the counterparty for these pools, so the market maker's worst-case loss
 * must be bounded and known before a pool opens. For a binary market LMSR bounds it
 * at `b * ln(2)`, which is what the liquidity fund allocates per pool.
 *
 * Cost function, with q the shares outstanding on each side:
 *   C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
 * Buying `d` shares of an outcome costs `C(q + d) - C(q)`, and the marginal price
 * is that cost per share, which rises as the side is bought — that is the AMM.
 *
 * ## Why floats appear here, and only here
 *
 * Money in this codebase is BigInt micros and prices are integer bps, because money
 * must never be a float. LMSR needs `exp`/`ln`, so that rule cannot hold literally
 * inside it. This module is therefore the single float boundary: every exported
 * function takes and returns integers, and floats exist only between those
 * boundaries. Nothing downstream recomputes a cost in floating point, so quote time
 * and execution time can never disagree by a micro.
 *
 * ## Rounding always favours the pool
 *
 * Costs round up and sale proceeds round down. Discretising a continuous curve into
 * ladder levels otherwise lets a trader walk the ladder for slightly less than the
 * true integral, which would break the loss bound the fund relies on.
 */

export type LmsrState = {
  /** Liquidity parameter in USDC micros. Larger = deeper book, larger max loss. */
  bMicros: bigint;
  qYesMicros: bigint;
  qNoMicros: bigint;
};

export const PRICE_BPS_MAX = 10_000;
/** Prices are clamped away from 0 and 1: a pool never quotes a certainty. */
export const MIN_QUOTE_BPS = 50;
export const MAX_QUOTE_BPS = 9_950;

const toNumber = (micros: bigint) => Number(micros);

/** log(e^x + e^y) computed without overflowing for large exponents. */
function logSumExp(x: number, y: number) {
  const max = Math.max(x, y);
  if (!Number.isFinite(max)) return max;
  return max + Math.log(Math.exp(x - max) + Math.exp(y - max));
}

/** C(q) in micros, as a float. Internal: callers get integers. */
function cost(state: LmsrState) {
  const b = toNumber(state.bMicros);
  if (b <= 0) return Number.NaN;
  const qYes = toNumber(state.qYesMicros);
  const qNo = toNumber(state.qNoMicros);
  return b * logSumExp(qYes / b, qNo / b);
}

function withShares(state: LmsrState, outcome: Outcome, deltaMicros: bigint): LmsrState {
  return outcome === "YES"
    ? { ...state, qYesMicros: state.qYesMicros + deltaMicros }
    : { ...state, qNoMicros: state.qNoMicros + deltaMicros };
}

export function assertValidState(state: LmsrState) {
  if (state.bMicros <= 0n) throw new Error("LMSR requires a positive liquidity parameter.");
  if (state.qYesMicros < 0n || state.qNoMicros < 0n) {
    throw new Error("LMSR share inventory cannot be negative.");
  }
}

/**
 * Marginal price of one outcome, in bps. This is the instantaneous price, which is
 * what a pool displays; the price actually paid comes from the ladder below and is
 * worse, because buying moves the price.
 */
export function marginalPriceBps(state: LmsrState, outcome: Outcome): number {
  assertValidState(state);
  const b = toNumber(state.bMicros);
  const qYes = toNumber(state.qYesMicros);
  const qNo = toNumber(state.qNoMicros);
  const own = outcome === "YES" ? qYes : qNo;
  const other = outcome === "YES" ? qNo : qYes;
  // Equivalent to e^(own/b) / (e^(own/b) + e^(other/b)), without overflowing.
  const price = 1 / (1 + Math.exp((other - own) / b));
  const bps = Math.round(price * PRICE_BPS_MAX);
  return Math.min(MAX_QUOTE_BPS, Math.max(MIN_QUOTE_BPS, bps));
}

/** Cost in micros to buy `sharesMicros` of an outcome. Rounds up, toward the pool. */
export function costToBuyMicros(state: LmsrState, outcome: Outcome, sharesMicros: bigint): bigint {
  assertValidState(state);
  if (sharesMicros <= 0n) return 0n;
  const delta = cost(withShares(state, outcome, sharesMicros)) - cost(state);
  if (!Number.isFinite(delta) || delta < 0) throw new Error("LMSR cost is not finite.");
  return BigInt(Math.ceil(delta));
}

/**
 * Proceeds in micros from selling `sharesMicros` back to the pool. Rounds down,
 * toward the pool. Selling more than the pool holds on that side is rejected: the
 * inventory is derived from recorded fills, so it cannot go negative.
 */
export function proceedsToSellMicros(state: LmsrState, outcome: Outcome, sharesMicros: bigint): bigint {
  assertValidState(state);
  if (sharesMicros <= 0n) return 0n;
  const held = outcome === "YES" ? state.qYesMicros : state.qNoMicros;
  if (sharesMicros > held) throw new Error("LMSR cannot sell more shares than the pool has sold.");
  const delta = cost(state) - cost(withShares(state, outcome, -sharesMicros));
  if (!Number.isFinite(delta) || delta < 0) throw new Error("LMSR proceeds are not finite.");
  return BigInt(Math.floor(delta));
}

/**
 * The market maker's bounded worst-case loss for a binary pool: `b * ln(2)`.
 * Rounded up, so the fund always allocates at least the true bound.
 */
export function maxLossMicros(bMicros: bigint): bigint {
  if (bMicros <= 0n) return 0n;
  return BigInt(Math.ceil(toNumber(bMicros) * Math.LN2));
}

/**
 * The liquidity parameter a given budget supports: the inverse of `maxLossMicros`,
 * so allocating `budget` from the fund can never expose more than `budget`.
 */
export function bForBudgetMicros(budgetMicros: bigint): bigint {
  if (budgetMicros <= 0n) return 0n;
  return BigInt(Math.floor(toNumber(budgetMicros) / Math.LN2));
}

export type LadderLevel = { priceBps: number; sharesMicros: bigint };

export type LadderOptions = {
  /** Shares per level. Smaller = finer ladder, more levels. */
  lotMicros: bigint;
  /** Price granularity in bps. Level prices are rounded to this. */
  tickBps: number;
  /** Maximum levels to emit. */
  maxLevels: number;
};

/**
 * Builds one side of the book by walking the cost curve.
 *
 * Each level is priced at the *marginal* cost of that lot given every preceding lot
 * has already been absorbed — the integral, not a flat quote at the current price.
 * Walking the whole ladder therefore reproduces `C(q') - C(q)` (never less), which
 * is what keeps `b * ln(2)` a real bound once the curve is discretised.
 */
export function buildAskLadder(
  state: LmsrState,
  outcome: Outcome,
  options: LadderOptions,
): LadderLevel[] {
  assertValidState(state);
  const levels: LadderLevel[] = [];
  let walked = 0n;
  for (let i = 0; i < options.maxLevels; i += 1) {
    const before = withShares(state, outcome, walked);
    const lotCost = costToBuyMicros(before, outcome, options.lotMicros);
    // Cost per share in bps, rounded UP to the tick so the pool is never underpaid.
    const perShareBps = (Number(lotCost) * PRICE_BPS_MAX) / Number(options.lotMicros);
    const ticked = Math.ceil(perShareBps / options.tickBps) * options.tickBps;
    if (ticked >= MAX_QUOTE_BPS) break; // the pool stops quoting near certainty
    levels.push({ priceBps: Math.max(options.tickBps, ticked), sharesMicros: options.lotMicros });
    walked += options.lotMicros;
  }
  return levels;
}

/**
 * The bid side: what the pool pays to buy shares back. Priced by the same integral,
 * rounded DOWN to the tick, and capped at the inventory the pool can actually buy
 * back on that side.
 */
export function buildBidLadder(
  state: LmsrState,
  outcome: Outcome,
  options: LadderOptions,
): LadderLevel[] {
  assertValidState(state);
  const held = outcome === "YES" ? state.qYesMicros : state.qNoMicros;
  const levels: LadderLevel[] = [];
  let walked = 0n;
  for (let i = 0; i < options.maxLevels; i += 1) {
    if (walked + options.lotMicros > held) break;
    const before = withShares(state, outcome, -walked);
    const lotProceeds = proceedsToSellMicros(before, outcome, options.lotMicros);
    const perShareBps = (Number(lotProceeds) * PRICE_BPS_MAX) / Number(options.lotMicros);
    const ticked = Math.floor(perShareBps / options.tickBps) * options.tickBps;
    if (ticked <= MIN_QUOTE_BPS) break;
    levels.push({ priceBps: ticked, sharesMicros: options.lotMicros });
    walked += options.lotMicros;
  }
  return levels;
}
