import { describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { ExecutionEngine } from "@/server/execution/engine";
import { memoryExecutionStore } from "@/server/execution/store";
import { createPolymarketClient, type VenueOrderRequest } from "@/server/polymarket/client";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { walkSide } from "@/server/execution/math";
import type { ExecutionIntentInput } from "@/server/execution/types";

const book: OrderBookSnapshot = {
  tokenId: "token-yes",
  asks: [
    { price: "0.5000", size: "15" },
    { price: "0.5100", size: "40" },
  ],
  bids: [{ price: "0.4900", size: "50" }],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "synthetic",
  timestamp: String(Date.now()),
  hash: "mock-clob",
};

function intent(id: string, shares: bigint): ExecutionIntentInput {
  return {
    executionId: `exec-${id}`,
    positionId: `pos-${id}`,
    marketId: "hype",
    outcome: "YES",
    tokenId: "token-yes",
    side: "BUY",
    sharesMicros: shares,
    notionalMicros: (shares * 5000n) / 10_000n,
    limitPriceBps: 5500,
    orderType: "FAK",
    tickSize: "0.01",
    negRisk: false,
    quotedPriceBps: 5000,
  };
}

describe("ExecutionEngine integration against a mocked CLOB", () => {
  it("submits net exposure through PolymarketClient and reconciles fills", async () => {
    const submitted: VenueOrderRequest[] = [];
    const client = createPolymarketClient({
      mode: "paper",
      getBook: async () => book,
      submitOrder: async (request) => {
        submitted.push(request);
        const fills = walkSide(book, request.side, request.limitPriceBps, request.sharesMicros, 10_000n);
        return {
          mode: "paper",
          status: "filled",
          polymarketOrderId: "clob-order-1",
          response: { id: "clob-order-1", status: "MATCHED" },
          fills: fills.map((fill, index) => ({
            ...fill,
            feeMicros: 0n,
            venueTradeId: `clob-${index + 1}`,
            simulated: true,
            raw: { mock: true, ...fill },
          })),
          errorMessage: null,
        };
      },
    });
    const engine = new ExecutionEngine(client, memoryExecutionStore(), defaultExecutionEngineConfig);
    await engine.enqueue(intent("one", 10_000_000n));
    const result = await engine.enqueueAndProcess(intent("two", 15_000_000n));

    expect(submitted.reduce((sum, row) => sum + row.sharesMicros, 0n)).toBe(25_000_000n);
    expect(submitted[0]?.tokenId).toBe("token-yes");
    expect(result.batch?.status).toBe("RECONCILED");
    expect(result.allocations.map((row) => row.executedSharesMicros).sort()).toEqual([
      10_000_000n,
      15_000_000n,
    ]);
    expect(result.batch?.metrics.avgPriceBps).toBeGreaterThan(0);
    expect(result.batch?.metrics.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.batch?.slices[0]?.polymarketOrderId).toBe("clob-order-1");
  });

  it("paper PolymarketClient walks the mocked book without a live CLOB", async () => {
    const client = createPolymarketClient({
      mode: "paper",
      getBook: async () => book,
    });
    const result = await client.submitOrder({
      tokenId: book.tokenId,
      side: "BUY",
      orderType: "FAK",
      limitPriceBps: 5500,
      sharesMicros: 10_000_000n,
      notionalMicros: 5_000_000n,
      tickSize: "0.01",
      negRisk: false,
      book,
    });
    expect(result.status).toBe("filled");
    expect(result.fills[0]?.priceBps).toBe(5000);
    expect(result.polymarketOrderId).toMatch(/^paper_/);
  });
});
