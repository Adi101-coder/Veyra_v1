import { describe, expect, it } from "vitest";
import { ConfidenceEngine } from "@/server/confidence/engine";
import { defaultConfidenceEngineConfig, loadConfidenceEngineConfig } from "@/server/confidence/config";
import { rawKellyBps, sizedKellyBps, sizedNotionalMicros, limitPriceBps } from "@/server/confidence/formula";
import type { EngineBook } from "@/server/confidence/types";

function book(overrides: Partial<EngineBook> = {}): EngineBook {
  return {
    tokenId: "token-yes",
    tickBps: 100,
    minSharesMicros: 1_000_000n,
    negRisk: false,
    source: "synthetic",
    asks: [{ priceBps: 5000, sizeMicros: 25_000_000_000n }],
    bids: [{ priceBps: 4900, sizeMicros: 25_000_000_000n }],
    ...overrides,
  };
}

const engine = new ConfidenceEngine(defaultConfidenceEngineConfig);

describe("ConfidenceEngine formula", () => {
  it("is deterministic", () => {
    const input = {
      outcome: "YES" as const,
      confidenceBps: 8000,
      stakeMicros: 100_000_000n,
      book: book(),
    };
    expect(engine.evaluate(input)).toEqual(engine.evaluate(input));
  });

  it("sizes a 80% view vs a 50¢ ask with quarter Kelly", () => {
    expect(rawKellyBps(8000, 5000)).toBe(6000);
    expect(sizedKellyBps(6000, defaultConfidenceEngineConfig)).toBe(1500);
    expect(sizedNotionalMicros(100_000_000n, 1500)).toBe(15_000_000n);

    const result = engine.evaluate({
      outcome: "YES",
      confidenceBps: 8000,
      stakeMicros: 100_000_000n,
      book: book(),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.notionalMicros).toBe(15_000_000n);
    expect(result.sharesMicros).toBe(30_000_000n);
    expect(result.avgPriceBps).toBe(5000);
    expect(result.notionalMicros <= 100_000_000n).toBe(true);
    expect(result.limitPriceBps).toBeGreaterThanOrEqual(5000);
    expect(result.limitPriceBps).toBeLessThanOrEqual(8000);
  });

  it("never pays above the user's fair value", () => {
    const limit = limitPriceBps(5000, 8000, 100, defaultConfidenceEngineConfig);
    expect(limit).toBeLessThanOrEqual(8000);
    expect(limit % 100).toBe(0);
  });

  it("rejects when confidence is not above the ask by min edge", () => {
    const result = engine.evaluate({
      outcome: "YES",
      confidenceBps: 5000,
      stakeMicros: 100_000_000n,
      book: book(),
    });
    expect(result).toMatchObject({ accepted: false, code: "NO_EDGE" });
  });

  it("rejects empty books", () => {
    const result = engine.evaluate({
      outcome: "YES",
      confidenceBps: 8000,
      stakeMicros: 100_000_000n,
      book: book({ asks: [] }),
    });
    expect(result).toMatchObject({ accepted: false, code: "NO_BOOK" });
  });

  it("walks multiple ask levels and stops at the limit", () => {
    const result = engine.evaluate({
      outcome: "YES",
      confidenceBps: 8000,
      stakeMicros: 100_000_000n,
      book: book({
        asks: [
          { priceBps: 5000, sizeMicros: 10_000_000n },
          { priceBps: 5400, sizeMicros: 50_000_000n },
          { priceBps: 9000, sizeMicros: 50_000_000n },
        ],
      }),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.fills.every((fill) => fill.priceBps <= result.limitPriceBps)).toBe(true);
    expect(result.fills.some((fill) => fill.priceBps === 9000)).toBe(false);
    expect(result.sharesMicros % 10_000n).toBe(0n);
  });

  it("sizes off the NO ask when the outcome is NO", () => {
    const result = engine.evaluate({
      outcome: "NO",
      confidenceBps: 7000,
      stakeMicros: 50_000_000n,
      book: book({
        tokenId: "token-no",
        asks: [{ priceBps: 4000, sizeMicros: 10_000_000_000n }],
      }),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.tokenId).toBe("token-no");
    expect(result.marketPriceBps).toBe(4000);
    expect(result.outcome).toBe("NO");
  });

  it("reads formula knobs from config instead of hardcoded callers", () => {
    const tight = new ConfidenceEngine(
      loadConfidenceEngineConfig({ VEYRA_MIN_EDGE_BPS: "2000" }),
    );
    const result = tight.evaluate({
      outcome: "YES",
      confidenceBps: 6000,
      stakeMicros: 100_000_000n,
      book: book(),
    });
    expect(result).toMatchObject({ accepted: false, code: "NO_EDGE" });
  });

  it("rejects a book that cannot fill the minimum size", () => {
    const result = engine.evaluate({
      outcome: "YES",
      confidenceBps: 8000,
      stakeMicros: 100_000_000n,
      book: book({
        minSharesMicros: 100_000_000n,
        asks: [{ priceBps: 5000, sizeMicros: 10_000n }],
      }),
    });
    expect(result).toMatchObject({ accepted: false, code: "INSUFFICIENT_LIQUIDITY" });
  });
});
