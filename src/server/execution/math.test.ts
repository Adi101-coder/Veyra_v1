import { describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import {
  analyzeBook,
  buildStrategy,
  crossIntents,
  independentExpectedSlippage,
  planSlices,
} from "@/server/execution/math";
import type { ExecutionIntentRow } from "@/server/execution/types";

const book: OrderBookSnapshot = {
  tokenId: "token-yes",
  asks: [
    { price: "0.5000", size: "20" },
    { price: "0.5200", size: "40" },
  ],
  bids: [
    { price: "0.4900", size: "20" },
    { price: "0.4700", size: "40" },
  ],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "synthetic",
  timestamp: String(Date.now()),
  hash: "book-1",
};

function intent(partial: Partial<ExecutionIntentRow> & Pick<ExecutionIntentRow, "id" | "side" | "sharesMicros" | "limitPriceBps">): ExecutionIntentRow {
  return {
    executionId: `exec-${partial.id}`,
    positionId: `pos-${partial.id}`,
    marketId: "hype",
    outcome: "YES",
    tokenId: "token-yes",
    notionalMicros: 0n,
    orderType: "FAK",
    tickSize: "0.01",
    negRisk: false,
    batchId: null,
    status: "QUEUED",
    executedSharesMicros: 0n,
    executedNotionalMicros: 0n,
    avgPriceBps: 0,
    feeMicros: 0n,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("execution book quality and strategy", () => {
  it("measures spread, depth, and min size", () => {
    const quality = analyzeBook(book);
    expect(quality.spreadBps).toBe(100);
    expect(quality.bestAskBps).toBe(5000);
    expect(quality.askDepthMicros).toBe(60_000_000n);
    expect(quality.minOrderSizeMicros).toBe(1_000_000n);
  });

  it("nets two buys into one venue order", () => {
    const strategy = buildStrategy(
      [
        intent({ id: "a", side: "BUY", sharesMicros: 10_000_000n, limitPriceBps: 5500 }),
        intent({ id: "b", side: "BUY", sharesMicros: 10_000_000n, limitPriceBps: 5400 }),
      ],
      book,
      defaultExecutionEngineConfig,
    );
    expect(strategy.netSide).toBe("BUY");
    expect(strategy.netSharesMicros).toBe(20_000_000n);
    expect(strategy.internalSharesMicros).toBe(0n);
    expect(strategy.slices.length).toBeGreaterThan(0);
  });

  it("crosses compatible buy and sell internally and only venues the residual", () => {
    const buys = [
      intent({ id: "buy", side: "BUY", sharesMicros: 30_000_000n, limitPriceBps: 5500 }),
      intent({ id: "sell", side: "SELL", sharesMicros: 10_000_000n, limitPriceBps: 4700 }),
    ];
    const { matches, residual } = crossIntents(buys, analyzeBook(book));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.sharesMicros).toBe(10_000_000n);
    expect(residual.reduce((sum, row) => sum + row.remaining, 0n)).toBe(20_000_000n);
    const strategy = buildStrategy(buys, book, defaultExecutionEngineConfig);
    expect(strategy.internalSharesMicros).toBe(10_000_000n);
    expect(strategy.venueSharesMicros).toBe(20_000_000n);
  });

  it("splits when size exceeds max slice", () => {
    const config = { ...defaultExecutionEngineConfig, maxSliceSharesMicros: 15_000_000n };
    const planned = planSlices(book, "BUY", 40_000_000n, 5500, config);
    expect(planned.slices.length).toBeGreaterThan(1);
    expect(planned.slices.every((slice) => slice.sharesMicros <= 15_000_000n)).toBe(true);
  });

  it("records independent expected slippage as a measurement, not a savings claim", () => {
    const intents = [
      intent({ id: "a", side: "BUY", sharesMicros: 25_000_000n, limitPriceBps: 5500 }),
      intent({ id: "b", side: "BUY", sharesMicros: 25_000_000n, limitPriceBps: 5500 }),
    ];
    const independent = independentExpectedSlippage(intents, book, 10_000n);
    const aggregated = buildStrategy(intents, book, defaultExecutionEngineConfig);
    expect(typeof independent).toBe("number");
    expect(typeof aggregated.expectedSlippageBps).toBe("number");
    expect(aggregated.independentExpectedSlippageBps).toBe(independent);
  });
});
