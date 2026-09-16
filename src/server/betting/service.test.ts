import { describe, expect, it } from "vitest";
import { coreMarkets } from "@/lib/markets";
import { placePrediction, quotePrediction, type BettingDeps } from "@/server/betting/service";
import { paperExecutor } from "@/server/polymarket/executor";
import { memoryStore } from "@/server/betting/memory-store";
import type { OrderBookSnapshot } from "@/lib/betting";

function deps(): BettingDeps {
  const market = {
    ...coreMarkets[0],
    clobTokenIds: ["token-yes", "token-no"],
  };
  const book: OrderBookSnapshot = {
    tokenId: "token-yes",
    asks: [{ price: "0.5000", size: "10000" }],
    bids: [{ price: "0.4900", size: "10000" }],
    minOrderSize: "1",
    tickSize: "0.01",
    negRisk: false,
    source: "synthetic",
  };
  return {
    store: memoryStore(),
    executor: paperExecutor(),
    getCatalogMarket: (id) => (id === market.id ? market : null),
    getLiveMarket: async () => null,
    getBook: async () => book,
  };
}

describe("placePrediction", () => {
  it("quotes, persists, and paper-fills a sized Polymarket position", async () => {
    const context = deps();
    const quote = await quotePrediction(
      { marketId: coreMarkets[0].id, outcome: "YES", confidencePct: 80, stakeUsd: "100.00" },
      context,
    );
    expect(quote.accepted).toBe(true);
    expect(quote.position?.shares).toBe("30.00");

    const placed = await placePrediction(
      {
        marketId: coreMarkets[0].id,
        outcome: "YES",
        confidencePct: 80,
        stakeUsd: "100.00",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        idempotencyKey: "idempotency-key-1",
      },
      context,
    );
    expect(placed.position?.status).toBe("filled");
    expect(placed.execution?.mode).toBe("paper");
    expect(placed.execution?.fills.length).toBeGreaterThan(0);
    expect(placed.execution?.polymarketOrderId).toMatch(/^paper_/);
  });

  it("returns the original row for a repeated idempotency key", async () => {
    const context = deps();
    const input = {
      marketId: coreMarkets[0].id,
      outcome: "YES" as const,
      confidencePct: 80,
      stakeUsd: "100.00",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      idempotencyKey: "idempotency-key-2",
    };
    const first = await placePrediction(input, context);
    const second = await placePrediction({ ...input, confidencePct: 90 }, context);
    expect(second.id).toBe(first.id);
    expect(second.confidencePct).toBe(first.confidencePct);
  });
});
