import { describe, expect, it } from "vitest";
import { defaultConfidenceEngineConfig } from "@/server/confidence/config";
import {
  applyFilledDelta,
  isStalePrice,
  planAdjustment,
  targetPositionFromConfidence,
} from "@/server/confidence/adjust";
import type { EngineBook } from "@/server/confidence/types";

const book: EngineBook = {
  tokenId: "token-yes",
  tickBps: 100,
  minSharesMicros: 1_000_000n,
  negRisk: false,
  source: "synthetic",
  asks: [{ priceBps: 5000, sizeMicros: 25_000_000_000n }],
  bids: [{ priceBps: 4900, sizeMicros: 25_000_000_000n }],
};

describe("confidence adjustment math", () => {
  it("sizes a smaller target when confidence drops from 80% to 60%", () => {
    const high = targetPositionFromConfidence(8000, 100_000_000n, 5000, defaultConfidenceEngineConfig);
    const low = targetPositionFromConfidence(6000, 100_000_000n, 5000, defaultConfidenceEngineConfig);
    expect(high.sharesMicros).toBe(30_000_000n);
    expect(low.sharesMicros).toBe(10_000_000n);
    expect(low.sharesMicros < high.sharesMicros).toBe(true);
  });

  it("plans a SELL for a decrease and a BUY for an increase", () => {
    const held = { sharesMicros: 30_000_000n, notionalMicros: 15_000_000n, avgPriceBps: 5000 };
    const down = targetPositionFromConfidence(6000, 100_000_000n, 5000, defaultConfidenceEngineConfig);
    const sell = planAdjustment(held, down, book, defaultConfidenceEngineConfig);
    expect(sell.side).toBe("SELL");
    expect(sell.deltaSharesMicros).toBe(20_000_000n);

    const up = targetPositionFromConfidence(9000, 100_000_000n, 5000, defaultConfidenceEngineConfig);
    const buy = planAdjustment(held, up, book, defaultConfidenceEngineConfig);
    expect(buy.side).toBe("BUY");
    expect(buy.signedDeltaSharesMicros > 0n).toBe(true);
  });

  it("flattens when the new view has no edge", () => {
    const held = { sharesMicros: 30_000_000n, notionalMicros: 15_000_000n, avgPriceBps: 5000 };
    const flat = targetPositionFromConfidence(5000, 100_000_000n, 5000, defaultConfidenceEngineConfig);
    expect(flat.flatten).toBe(true);
    const plan = planAdjustment(held, flat, book, defaultConfidenceEngineConfig);
    expect(plan.side).toBe("SELL");
    expect(plan.deltaSharesMicros).toBe(30_000_000n);
  });

  it("detects stale quotes", () => {
    expect(isStalePrice(5000, 5000, 500)).toBe(false);
    expect(isStalePrice(5000, 5600, 500)).toBe(true);
  });

  it("applies buy and sell fills onto carrying inventory", () => {
    const held = { sharesMicros: 30_000_000n, notionalMicros: 15_000_000n, avgPriceBps: 5000 };
    const afterBuy = applyFilledDelta(held, "BUY", 10_000_000n, 5_000_000n);
    expect(afterBuy.sharesMicros).toBe(40_000_000n);
    const afterSell = applyFilledDelta(held, "SELL", 10_000_000n, 4_900_000n);
    expect(afterSell.sharesMicros).toBe(20_000_000n);
    expect(afterSell.avgPriceBps).toBe(5000);
  });
});
