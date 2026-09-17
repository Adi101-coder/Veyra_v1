import { describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { ExecutionEngine } from "@/server/execution/engine";
import { memoryExecutionStore } from "@/server/execution/store";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import type { ExecutionIntentInput } from "@/server/execution/types";

const book: OrderBookSnapshot = {
  tokenId: "token-yes",
  asks: [{ price: "0.5000", size: "10000" }],
  bids: [{ price: "0.4900", size: "10000" }],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "synthetic",
  timestamp: String(Date.now()),
  hash: "live-book",
};

function intent(id: string, side: "BUY" | "SELL", shares: bigint, limit = 5500): ExecutionIntentInput {
  return {
    executionId: `exec-${id}`,
    positionId: `pos-${id}`,
    predictionId: `pred-${id}`,
    marketId: "hype",
    outcome: "YES",
    tokenId: "token-yes",
    side,
    sharesMicros: shares,
    notionalMicros: (shares * BigInt(limit)) / 10_000n,
    limitPriceBps: limit,
    orderType: "FAK",
    tickSize: "0.01",
    negRisk: false,
    quotedPriceBps: 5000,
  };
}

function engineWith(
  submit: (request: VenueOrderRequest) => Promise<VenueOrderResult>,
  extra?: { getBook?: () => Promise<OrderBookSnapshot> },
) {
  const submits: VenueOrderRequest[] = [];
  const client = createPolymarketClient({
    mode: "paper",
    getBook: extra?.getBook ?? (async () => book),
    submitOrder: async (request) => {
      submits.push(request);
      return submit(request);
    },
  });
  return {
    submits,
    engine: new ExecutionEngine(client, memoryExecutionStore(), defaultExecutionEngineConfig),
  };
}

function filledResult(request: VenueOrderRequest, fraction = 1): VenueOrderResult {
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 100))) / 100n;
  const notional = (shares * BigInt(request.limitPriceBps)) / 10_000n;
  return {
    mode: "paper",
    status: fraction >= 1 ? "filled" : fraction > 0 ? "partial" : "failed",
    polymarketOrderId: `venue-${request.tokenId}`,
    response: { ok: true },
    fills:
      shares > 0n
        ? [
            {
              priceBps: 5000,
              sharesMicros: shares,
              notionalMicros: notional,
              feeMicros: 0n,
              venueTradeId: "t-1",
              simulated: true,
            },
          ]
        : [],
    errorMessage: shares > 0n ? null : "no fill",
  };
}

describe("ExecutionEngine", () => {
  it("aggregates two compatible buys into one venue order", async () => {
    const { engine, submits } = engineWith(async (request) => filledResult(request));
    await engine.enqueue(intent("a", "BUY", 10_000_000n));
    const processed = await engine.enqueueAndProcess(intent("b", "BUY", 10_000_000n));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.sharesMicros).toBe(20_000_000n);
    expect(processed.batch?.status).toBe("RECONCILED");
    expect(processed.allocations).toHaveLength(2);
    expect(processed.allocations.every((row) => row.status === "filled")).toBe(true);
    expect(processed.batch?.metrics.requestedSharesMicros).toBe(20_000_000n);
    expect(processed.batch?.metrics.venueSharesMicros).toBe(20_000_000n);
  });

  it("internalizes a buy/sell overlap and only venues the net", async () => {
    const { engine, submits } = engineWith(async (request) => filledResult(request));
    await engine.enqueue(intent("buy", "BUY", 30_000_000n, 5500));
    const processed = await engine.enqueueAndProcess(intent("sell", "SELL", 10_000_000n, 4700));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.side).toBe("BUY");
    expect(submits[0]?.sharesMicros).toBe(20_000_000n);
    expect(processed.batch?.metrics.internalSharesMicros).toBe(10_000_000n);
    const sell = processed.allocations.find((row) => row.executionId === "exec-sell");
    expect(sell?.status).toBe("filled");
    expect(sell?.fills.some((fill) => fill.venueTradeId.startsWith("internal-"))).toBe(true);
  });

  it("keeps a failed venue order from moving inventory", async () => {
    const { engine } = engineWith(async (request) => filledResult(request, 0));
    const processed = await engine.enqueueAndProcess(intent("fail", "BUY", 10_000_000n));
    expect(processed.allocation?.status).toBe("failed");
    expect(processed.allocation?.executedSharesMicros).toBe(0n);
    expect(processed.batch?.metrics.executedSharesMicros).toBe(0n);
  });

  it("allocates a partial venue fill and leaves residual unfilled", async () => {
    const { engine } = engineWith(async (request) => filledResult(request, 0.5));
    const processed = await engine.enqueueAndProcess(intent("p", "BUY", 20_000_000n));
    expect(processed.allocation?.status).toBe("partial");
    expect(processed.allocation?.executedSharesMicros).toBe(10_000_000n);
    expect(processed.batch?.status).toBe("RECONCILED");
  });

  it("replays an idempotent enqueue without a second venue order", async () => {
    const { engine, submits } = engineWith(async (request) => filledResult(request));
    const first = await engine.enqueue({ ...intent("dup", "BUY", 10_000_000n), idempotencyKey: "same-exec-key" });
    const second = await engine.enqueue({ ...intent("dup-2", "BUY", 99_000_000n), idempotencyKey: "same-exec-key" });
    expect(second.id).toBe(first.id);
    await engine.processToken("token-yes");
    expect(submits).toHaveLength(1);
    expect(submits[0]?.sharesMicros).toBe(10_000_000n);
  });

  it("retries only a venue-refused (retryable) slice, then fills", async () => {
    let attempts = 0;
    const { engine } = engineWith(async (request) => {
      attempts += 1;
      if (attempts === 1) {
        return { ...filledResult(request, 0), status: "rejected", polymarketOrderId: null, retryable: true };
      }
      return filledResult(request, 1);
    });
    const processed = await engine.enqueueAndProcess(intent("r", "BUY", 10_000_000n));
    expect(attempts).toBe(2);
    expect(processed.allocation?.status).toBe("filled");
  });

  it("never re-posts an order whose outcome is unknown (timeout)", async () => {
    let attempts = 0;
    const { engine } = engineWith(async (request) => {
      attempts += 1;
      return { ...filledResult(request, 0), status: "unknown", polymarketOrderId: null, errorMessage: "timeout" };
    });
    const processed = await engine.enqueueAndProcess(intent("timeout", "BUY", 10_000_000n));
    expect(attempts).toBe(1);
    expect(processed.allocation?.status).toBe("pending");
    expect(processed.allocation?.executedSharesMicros).toBe(0n);
    expect(processed.batch?.status).toBe("SUBMITTED");
  });

  it("keeps an accepted resting order pending, then reconciles real venue fills", async () => {
    let attempts = 0;
    let venue: VenueOrderResult | null = null;
    const store = memoryExecutionStore();
    const client = createPolymarketClient({
      mode: "live",
      getBook: async () => book,
      submitOrder: async (request) => {
        attempts += 1;
        return { ...filledResult(request, 0), status: "open", polymarketOrderId: "order-1", errorMessage: null };
      },
      getOrder: async () => venue,
    });
    const engine = new ExecutionEngine(client, store, defaultExecutionEngineConfig);
    const processed = await engine.enqueueAndProcess(intent("rest", "BUY", 10_000_000n));
    expect(attempts).toBe(1);
    expect(processed.allocation?.status).toBe("pending");

    // Still resting: nothing changes.
    venue = { ...filledResult({ ...processed.intent, book } as never, 0), status: "open", polymarketOrderId: "order-1" };
    const stillOpen = await engine.reconcileBatch(processed.batch!.id);
    expect(stillOpen?.batch.status).toBe("SUBMITTED");
    expect(stillOpen?.allocations[0]?.executedSharesMicros).toBe(0n);

    // Venue cancels after a 40% fill: allocate exactly the reported fill, once.
    venue = {
      ...filledResult({ sharesMicros: 10_000_000n, limitPriceBps: 5000, tokenId: "token-yes" } as never, 0.4),
      status: "partial",
      polymarketOrderId: "order-1",
    };
    const done = await engine.reconcileBatch(processed.batch!.id);
    expect(done?.batch.status).toBe("RECONCILED");
    expect(done?.allocations[0]?.status).toBe("partial");
    expect(done?.allocations[0]?.executedSharesMicros).toBe(4_000_000n);
    expect(await engine.reconcileBatch(processed.batch!.id)).toBeNull();
  });

  it("fails (never requeues) intents whose quoted price is stale, without touching the venue", async () => {
    const { engine, submits } = engineWith(async (request) => filledResult(request));
    const processed = await engine.enqueueAndProcess({ ...intent("stale", "BUY", 10_000_000n), quotedPriceBps: 4000 });
    expect(submits).toHaveLength(0);
    expect(processed.allocation?.status).toBe("failed");
    expect(processed.allocation?.errorCode).toBe("STALE_PRICE");
    expect(await engine.processAll()).toEqual([]);
  });

  it("recovers intents a crashed worker left PROCESSING without re-sending them", async () => {
    const store = memoryExecutionStore();
    const client = createPolymarketClient({ mode: "paper", getBook: async () => book, submitOrder: async (r) => filledResult(r) });
    const engine = new ExecutionEngine(client, store, defaultExecutionEngineConfig);
    await engine.enqueue(intent("crash", "BUY", 10_000_000n));
    // Simulate a worker that claimed the intent and died before any batch was submitted.
    await store.claimQueued("token-yes");
    const recovered = await engine.recoverStuck(-1_000);
    expect(recovered.recovered).toBe(1);
    expect(recovered.allocations[0]).toMatchObject({ executionId: "exec-crash", status: "failed", errorCode: "WORKER_ABORTED" });
    expect((await store.findIntentByExecutionId("exec-crash"))?.status).toBe("FAILED");
    expect(await engine.processAll()).toEqual([]);
  });
});
