import { describe, expect, it } from "vitest";
import { coreMarkets } from "@/lib/markets";
import {
  changeConfidence,
  listConfidenceHistory,
  placePrediction,
  type BettingDeps,
} from "@/server/betting/service";
import { memoryStore } from "@/server/betting/memory-store";
import { paperExecutor, type ExecutionRequest, type ExecutorPort } from "@/server/polymarket/executor";
import type { OrderBookSnapshot } from "@/lib/betting";
import { BettingError } from "@/server/errors";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

const book: OrderBookSnapshot = {
  tokenId: "token-yes",
  asks: [{ price: "0.5000", size: "10000" }],
  bids: [{ price: "0.4900", size: "10000" }],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "synthetic",
};

function deps(executor: ExecutorPort = paperExecutor()): BettingDeps {
  const market = { ...coreMarkets[0], clobTokenIds: ["token-yes", "token-no"] };
  return {
    store: memoryStore(),
    executor,
    getCatalogMarket: (id) => (id === market.id ? market : null),
    getLiveMarket: async () => null,
    getBook: async () => book,
  };
}

function failingExecutor(): ExecutorPort {
  return {
    mode: "paper",
    async submit() {
      return {
        mode: "paper",
        status: "failed",
        polymarketOrderId: null,
        response: { error: "venue down" },
        fills: [],
        errorMessage: "venue down",
      };
    },
    async getOrder() {
      return null;
    },
  };
}

async function openAt80(context: BettingDeps) {
  return placePrediction(
    {
      marketId: coreMarkets[0].id,
      outcome: "YES",
      confidencePct: 80,
      stakeUsd: "100.00",
      walletAddress: WALLET,
    },
    context,
  );
}

function partialExecutor(): ExecutorPort {
  const inner = paperExecutor();
  return {
    mode: "paper",
    async submit(request: ExecutionRequest) {
      const full = await inner.submit(request);
      const fill = full.fills[0];
      if (!fill) return { ...full, status: "failed", fills: [] };
      const halfShares = fill.sharesMicros / 2n;
      const halfNotional = fill.notionalMicros / 2n;
      return {
        ...full,
        status: "partial",
        fills: [{ ...fill, sharesMicros: halfShares, notionalMicros: halfNotional }],
      };
    },
    getOrder: inner.getOrder,
  };
}

describe("changeConfidence", () => {
  it("decreases confidence from 80% to 60% without overwriting history", async () => {
    const context = deps();
    const opened = await openAt80(context);
    expect(opened.position?.shares).toBe("30.00");

    const changed = await changeConfidence(
      opened.id,
      { confidencePct: 60, walletAddress: WALLET, idempotencyKey: "change-down-1" },
      context,
    );

    expect(changed.prediction.confidencePct).toBe(60);
    expect(Number(changed.prediction.position?.shares)).toBeLessThan(30);
    expect(changed.history.previousConfidencePct).toBe(80);
    expect(changed.history.newConfidencePct).toBe(60);
    expect(changed.history.side).toBe("SELL");
    expect(changed.history.status).toBe("filled");
    expect(changed.history.previousPosition.shares).toBe("30.00");

    const trail = await listConfidenceHistory(opened.id, context);
    expect(trail).toHaveLength(1);
    expect(trail[0]?.previousConfidencePct).toBe(80);
  });

  it("increases confidence and buys the delta only", async () => {
    const context = deps();
    const opened = await openAt80(context);
    const changed = await changeConfidence(
      opened.id,
      { confidencePct: 90, walletAddress: WALLET },
      context,
    );
    expect(changed.prediction.confidencePct).toBe(90);
    expect(changed.history.side).toBe("BUY");
    expect(Number(changed.prediction.position?.shares)).toBeGreaterThan(30);
    expect(changed.history.status).toBe("filled");
  });

  it("keeps a trail across repeated changes", async () => {
    const context = deps();
    const opened = await openAt80(context);
    await changeConfidence(opened.id, { confidencePct: 70, walletAddress: WALLET }, context);
    await changeConfidence(opened.id, { confidencePct: 90, walletAddress: WALLET }, context);
    const trail = await listConfidenceHistory(opened.id, context);
    expect(trail).toHaveLength(2);
    expect(trail.map((row) => row.newConfidencePct).sort()).toEqual([70, 90]);
    expect(trail.every((row) => row.previousConfidencePct !== row.newConfidencePct)).toBe(true);
  });

  it("does not move inventory or current confidence when execution fails", async () => {
    const openedDeps = deps();
    const opened = await openAt80(openedDeps);
    const changed = await changeConfidence(
      opened.id,
      { confidencePct: 60, walletAddress: WALLET },
      { ...openedDeps, executor: failingExecutor(), engine: undefined, client: undefined },
    );
    expect(changed.prediction.confidencePct).toBe(80);
    expect(changed.prediction.position?.shares).toBe("30.00");
    expect(changed.history.status).toBe("failed");
    expect(changed.history.previousConfidencePct).toBe(80);
    expect(changed.history.newConfidencePct).toBe(60);
  });

  it("applies only the filled delta on a partial and leaves confidence at the last fully reconciled value", async () => {
    const openedDeps = deps();
    const opened = await openAt80(openedDeps);
    const changed = await changeConfidence(
      opened.id,
      { confidencePct: 60, walletAddress: WALLET },
      { ...openedDeps, executor: partialExecutor(), engine: undefined, client: undefined },
    );
    expect(changed.history.status).toBe("partial");
    expect(changed.prediction.confidencePct).toBe(80);
    expect(Number(changed.prediction.position?.shares)).toBeLessThan(30);
    expect(Number(changed.prediction.position?.shares)).toBeGreaterThan(10);
  });

  it("replays a duplicate idempotency key without a second fill", async () => {
    const context = deps();
    const opened = await openAt80(context);
    const first = await changeConfidence(
      opened.id,
      { confidencePct: 60, walletAddress: WALLET, idempotencyKey: "same-change-key" },
      context,
    );
    const second = await changeConfidence(
      opened.id,
      { confidencePct: 60, walletAddress: WALLET, idempotencyKey: "same-change-key" },
      context,
    );
    expect(second.history.id).toBe(first.history.id);
    expect(second.prediction.confidencePct).toBe(60);
    // Reusing the key for a different confidence is rejected, not silently replayed.
    await expect(
      changeConfidence(opened.id, { confidencePct: 90, walletAddress: WALLET, idempotencyKey: "same-change-key" }, context),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await listConfidenceHistory(opened.id, context)).toHaveLength(1);
  });

  it("rejects a stale quoted price and a concurrent expected confidence", async () => {
    const context = deps();
    const opened = await openAt80(context);
    await expect(
      changeConfidence(
        opened.id,
        { confidencePct: 60, walletAddress: WALLET, quotedMarketPrice: "0.4000" },
        context,
      ),
    ).rejects.toMatchObject({ code: "STALE_PRICE" } satisfies Partial<BettingError>);

    await expect(
      changeConfidence(
        opened.id,
        { confidencePct: 60, walletAddress: WALLET, expectedConfidencePct: 70 },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONCURRENT_UPDATE" } satisfies Partial<BettingError>);
  });

  it("rejects a second change while the position lock is held", async () => {
    const context = deps();
    const opened = await openAt80(context);
    const locked = await context.store.claimAdjustmentLock(opened.position!.id);
    expect(locked).toBe(true);
    await expect(
      changeConfidence(opened.id, { confidencePct: 60, walletAddress: WALLET }, context),
    ).rejects.toMatchObject({ code: "CONCURRENT_UPDATE" } satisfies Partial<BettingError>);
  });

  it("rejects adjusting to 0% or 100% (same range as placement)", async () => {
    const context = deps();
    const opened = await placePrediction(
      { marketId: coreMarkets[0].id, outcome: "YES", confidencePct: 80, stakeUsd: "100.00", walletAddress: WALLET, idempotencyKey: "range-open-0001" },
      context,
    );
    for (const confidencePct of [0, 100]) {
      await expect(changeConfidence(opened.id, { confidencePct, walletAddress: WALLET }, context)).rejects.toMatchObject({
        code: "CONFIDENCE_RANGE",
      });
    }
  });

  it("90% -> 90% is rejected as unchanged and creates no history or execution", async () => {
    const context = deps();
    const opened = await placePrediction(
      { marketId: coreMarkets[0].id, outcome: "YES", confidencePct: 90, stakeUsd: "100.00", walletAddress: WALLET, idempotencyKey: "same-conf-open-1" },
      context,
    );
    await expect(
      changeConfidence(opened.id, { confidencePct: 90, walletAddress: WALLET }, context),
    ).rejects.toMatchObject({ code: "UNCHANGED" });
    expect(await listConfidenceHistory(opened.id, context)).toHaveLength(0);
  });

  it("90% -> 10% flattens the position (no edge) and records a SELL", async () => {
    const context = deps();
    const opened = await placePrediction(
      { marketId: coreMarkets[0].id, outcome: "YES", confidencePct: 90, stakeUsd: "100.00", walletAddress: WALLET, idempotencyKey: "flatten-open-01" },
      context,
    );
    expect(Number(opened.position?.shares)).toBeGreaterThan(0);
    const changed = await changeConfidence(opened.id, { confidencePct: 10, walletAddress: WALLET }, context);
    expect(changed.history.side).toBe("SELL");
    expect(changed.history.status).toBe("filled");
    expect(changed.prediction.position?.shares).toBe("0.00");
    expect(changed.prediction.position?.status).toBe("closed");
    expect(changed.prediction.confidencePct).toBe(10);
    // Closed positions can re-enter.
    const again = await changeConfidence(opened.id, { confidencePct: 80, walletAddress: WALLET }, context);
    expect(again.history.side).toBe("BUY");
    expect(Number(again.prediction.position?.shares)).toBeGreaterThan(0);
  });
});
