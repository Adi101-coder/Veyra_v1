import { describe, expect, it } from "vitest";
import {
  bForBudgetMicros,
  buildAskLadder,
  buildBidLadder,
  costToBuyMicros,
  marginalPriceBps,
  maxLossMicros,
  proceedsToSellMicros,
  type LadderOptions,
  type LmsrState,
} from "@/server/pools/lmsr";

const USDC = 1_000_000n;
const b = (usd: number) => BigInt(usd) * USDC;
const shares = (n: number) => BigInt(Math.round(n * 1_000_000));

const fresh = (bUsd = 1000): LmsrState => ({ bMicros: b(bUsd), qYesMicros: 0n, qNoMicros: 0n });

const LADDER: LadderOptions = { lotMicros: shares(1), tickBps: 100, maxLevels: 200 };

describe("LMSR pricing", () => {
  it("prices a fresh binary pool at 50/50", () => {
    const state = fresh();
    expect(marginalPriceBps(state, "YES")).toBe(5000);
    expect(marginalPriceBps(state, "NO")).toBe(5000);
  });

  it("moves the price against whoever is buying", () => {
    const state = fresh();
    const after = { ...state, qYesMicros: shares(500) };
    expect(marginalPriceBps(after, "YES")).toBeGreaterThan(5000);
    expect(marginalPriceBps(after, "NO")).toBeLessThan(5000);
    // YES and NO always price to one whole unit, within rounding.
    expect(marginalPriceBps(after, "YES") + marginalPriceBps(after, "NO")).toBeCloseTo(10_000, -1);
  });

  it("charges more per share the more you buy", () => {
    const state = fresh();
    const small = costToBuyMicros(state, "YES", shares(10));
    const large = costToBuyMicros(state, "YES", shares(100));
    expect(Number(large) / 100).toBeGreaterThan(Number(small) / 10);
  });

  it("never lets a round trip profit at the pool's expense", () => {
    // Buy then immediately sell back: the trader must not come out ahead.
    for (const size of [1, 10, 100, 1000]) {
      const state = fresh();
      const paid = costToBuyMicros(state, "YES", shares(size));
      const after = { ...state, qYesMicros: shares(size) };
      const refund = proceedsToSellMicros(after, "YES", shares(size));
      expect(refund).toBeLessThanOrEqual(paid);
    }
  });

  it("bounds the worst-case loss at b*ln(2) and inverts it for budgeting", () => {
    expect(maxLossMicros(b(1000))).toBe(BigInt(Math.ceil(1_000_000_000 * Math.LN2)));
    // A budget converted to b and back never exceeds the budget.
    for (const budget of [b(50), b(137), b(1000), b(9999)]) {
      expect(maxLossMicros(bForBudgetMicros(budget))).toBeLessThanOrEqual(budget);
    }
    expect(bForBudgetMicros(0n)).toBe(0n);
    expect(maxLossMicros(0n)).toBe(0n);
  });

  it("refuses an invalid state or an oversized sell", () => {
    expect(() => marginalPriceBps({ bMicros: 0n, qYesMicros: 0n, qNoMicros: 0n }, "YES")).toThrow();
    expect(() => marginalPriceBps({ bMicros: b(10), qYesMicros: -1n, qNoMicros: 0n }, "YES")).toThrow();
    expect(() => proceedsToSellMicros(fresh(), "YES", shares(1))).toThrow(/more shares than/);
  });
});

describe("LMSR ladder", () => {
  it("prices each level as the integral, so walking it never underpays the pool", () => {
    // This is the property that keeps b*ln(2) a real bound after discretisation:
    // the sum of the ladder must be >= the true continuous cost of the same size.
    // A thin pool and a fine tick, so the curve's steepness dominates tick rounding:
    // with a flat ladder (every level at today's price) the walk underpays badly.
    const state = fresh(10);
    const fine = { lotMicros: shares(1), tickBps: 1, maxLevels: 40 };
    const levels = buildAskLadder(state, "YES", fine);
    expect(levels.length).toBeGreaterThan(10);

    let walkedShares = 0n;
    let walkedCost = 0n;
    for (const level of levels) {
      walkedShares += level.sharesMicros;
      walkedCost += (BigInt(level.priceBps) * level.sharesMicros) / 10_000n;
    }
    const trueCost = costToBuyMicros(state, "YES", walkedShares);
    expect(walkedCost).toBeGreaterThanOrEqual(trueCost);

    // And the ladder must actually climb: a flat ladder would cost far less than
    // the integral over this range.
    const flatCost =
      (BigInt(marginalPriceBps(state, "YES")) * walkedShares) / 10_000n;
    expect(trueCost).toBeGreaterThan(flatCost);
  });

  it("quotes a rising ask ladder and a falling bid ladder", () => {
    const state = { bMicros: b(1000), qYesMicros: shares(200), qNoMicros: 0n };
    const asks = buildAskLadder(state, "YES", LADDER);
    const bids = buildBidLadder(state, "YES", LADDER);
    expect(asks.length).toBeGreaterThan(0);
    expect(bids.length).toBeGreaterThan(0);
    for (let i = 1; i < asks.length; i += 1) {
      expect(asks[i]!.priceBps).toBeGreaterThanOrEqual(asks[i - 1]!.priceBps);
    }
    for (let i = 1; i < bids.length; i += 1) {
      expect(bids[i]!.priceBps).toBeLessThanOrEqual(bids[i - 1]!.priceBps);
    }
    // The pool never pays more to buy back than it charges to sell.
    expect(bids[0]!.priceBps).toBeLessThanOrEqual(asks[0]!.priceBps);
  });

  it("only offers to buy back what the pool actually sold", () => {
    const state = { bMicros: b(1000), qYesMicros: shares(3), qNoMicros: 0n };
    const bids = buildBidLadder(state, "YES", LADDER);
    const offered = bids.reduce((sum, level) => sum + level.sharesMicros, 0n);
    expect(offered).toBeLessThanOrEqual(shares(3));
    expect(buildBidLadder(fresh(), "YES", LADDER)).toEqual([]);
  });

  it("stops quoting near certainty instead of selling a sure thing", () => {
    const state = { bMicros: b(100), qYesMicros: shares(5000), qNoMicros: 0n };
    const asks = buildAskLadder(state, "YES", LADDER);
    // Price is pinned at ~1, so there is nothing left to sell on this side.
    expect(asks).toEqual([]);
    expect(marginalPriceBps(state, "YES")).toBeLessThanOrEqual(9_950);
    expect(marginalPriceBps(state, "NO")).toBeGreaterThanOrEqual(50);
  });

  it("keeps the pool solvent across random buy and sell sequences", () => {
    // The invariant that makes the AMM safe: whatever traders do, the pool's payout
    // at resolution cannot exceed what it collected plus its bounded subsidy.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };

    for (let run = 0; run < 40; run += 1) {
      const state: LmsrState = fresh(500);
      let collected = 0n;
      for (let step = 0; step < 30; step += 1) {
        const outcome = rand() < 0.5 ? "YES" : "NO";
        const size = shares(Math.max(1, Math.floor(rand() * 50)));
        const held = outcome === "YES" ? state.qYesMicros : state.qNoMicros;
        if (rand() < 0.65 || held < size) {
          collected += costToBuyMicros(state, outcome, size);
          if (outcome === "YES") state.qYesMicros += size;
          else state.qNoMicros += size;
        } else {
          collected -= proceedsToSellMicros(state, outcome, size);
          if (outcome === "YES") state.qYesMicros -= size;
          else state.qNoMicros -= size;
        }
      }
      // Resolution pays 1 USDC per winning share, whichever side wins.
      const worstPayout =
        state.qYesMicros > state.qNoMicros ? state.qYesMicros : state.qNoMicros;
      const subsidy = worstPayout - collected;
      expect(subsidy).toBeLessThanOrEqual(maxLossMicros(state.bMicros));
    }
  });
});
