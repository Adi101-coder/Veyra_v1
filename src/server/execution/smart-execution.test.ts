import { describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { ExecutionEngine } from "@/server/execution/engine";
import { memoryExecutionStore } from "@/server/execution/store";
import { defaultExecutionEngineConfig, type ExecutionEngineConfig } from "@/server/execution/config";
import type { ExecutionIntentInput } from "@/server/execution/types";
import { createPolymarketClient, type PolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";
import { VenueTimeoutError, withTimeout } from "@/server/polymarket/live";

function book(overrides: Partial<OrderBookSnapshot> = {}): OrderBookSnapshot {
  return {
    tokenId: "tok",
    asks: [{ price: "0.50", size: "1000" }],
    bids: [{ price: "0.49", size: "1000" }],
    minOrderSize: "1",
    tickSize: "0.01",
    negRisk: false,
    source: "polymarket",
    timestamp: String(Date.now()),
    hash: "h",
    ...overrides,
  };
}

let seq = 0;
function intent(side: "BUY" | "SELL", shares: bigint, overrides: Partial<ExecutionIntentInput> = {}): ExecutionIntentInput {
  seq += 1;
  const limit = overrides.limitPriceBps ?? (side === "BUY" ? 5500 : 4500);
  return {
    executionId: `exec-${seq}`,
    positionId: `pos-${seq}`,
    marketId: "m",
    outcome: "YES",
    tokenId: "tok",
    side,
    sharesMicros: shares,
    notionalMicros: (shares * BigInt(limit)) / 10_000n,
    limitPriceBps: limit,
    orderType: "FAK",
    tickSize: "0.01",
    negRisk: false,
    quotedPriceBps: 5000,
    ...overrides,
  };
}

/** Venue fill of `fraction` of the request at `priceBps`. */
function fill(request: VenueOrderRequest, fraction = 1, priceBps = request.side === "BUY" ? 5000 : 4900, id = `o-${Math.random()}`): VenueOrderResult {
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 1000))) / 1000n;
  return {
    mode: "live",
    status: shares >= request.sharesMicros ? "filled" : shares > 0n ? "partial" : "rejected",
    polymarketOrderId: id,
    response: {},
    fills:
      shares > 0n
        ? [{ priceBps, sharesMicros: shares, notionalMicros: (shares * BigInt(priceBps)) / 10_000n, feeMicros: 0n, venueTradeId: `t-${id}`, simulated: false }]
        : [],
    errorMessage: shares > 0n ? null : "no fill",
  };
}

function setup(
  submit: (request: VenueOrderRequest, n: number) => Promise<VenueOrderResult> | VenueOrderResult,
  options: { book?: () => OrderBookSnapshot; config?: Partial<ExecutionEngineConfig>; client?: Partial<PolymarketClient> } = {},
) {
  const requests: VenueOrderRequest[] = [];
  const store = memoryExecutionStore();
  const client = createPolymarketClient({
    mode: "live",
    getBook: async () => (options.book ?? book)(),
    submitOrder: async (request) => {
      requests.push(request);
      return submit(request, requests.length);
    },
  });
  Object.assign(client, options.client ?? {});
  const engine = new ExecutionEngine(client, store, { ...defaultExecutionEngineConfig, ...options.config });
  return { engine, store, requests, client };
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

describe("Smart Execution: aggregation and allocation", () => {
  it("aggregates compatible buys into one venue order and allocates every filled share", async () => {
    const { engine, requests } = setup((r) => fill(r));
    const a = intent("BUY", 3_000_000n);
    const b = intent("BUY", 3_000_000n);
    const c = intent("BUY", 4_000_000n);
    await engine.enqueue(a);
    await engine.enqueue(b);
    const processed = await engine.enqueueAndProcess(c);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.sharesMicros).toBe(10_000_000n);
    expect(sum(processed.allocations.map((row) => row.executedSharesMicros))).toBe(10_000_000n);
    expect(processed.allocations.every((row) => row.status === "filled")).toBe(true);
  });

  it("never credits venue BUY fills to an opposing SELL whose limit did not cross", async () => {
    const { engine, requests } = setup((r) => fill(r));
    const sell = intent("SELL", 4_000_000n, { limitPriceBps: 6000 });
    await engine.enqueue(sell);
    const processed = await engine.enqueueAndProcess(intent("BUY", 10_000_000n, { limitPriceBps: 5500 }));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.side).toBe("BUY");
    const sellAllocation = processed.allocations.find((row) => row.executionId === sell.executionId)!;
    expect(sellAllocation.executedSharesMicros).toBe(0n);
    expect(sellAllocation.status).toBe("failed");
    const buyAllocation = processed.allocations.find((row) => row.executionId !== sell.executionId)!;
    expect(buyAllocation.executedSharesMicros).toBe(10_000_000n);
  });

  it("allocates a venue overfill (USDC market BUY at a better price) instead of dropping shares", async () => {
    const { engine } = setup((r) => fill(r, 1.1, 4500));
    await engine.enqueue(intent("BUY", 3_000_000n));
    const processed = await engine.enqueueAndProcess(intent("BUY", 7_000_000n));
    expect(sum(processed.allocations.map((row) => row.executedSharesMicros))).toBe(11_000_000n);
    expect(processed.batch?.metrics.venueSharesMicros).toBe(11_000_000n);
  });

  it("partial venue fill is split pro-rata with no rounding loss", async () => {
    const { engine } = setup((r) => fill(r, 0.333));
    await engine.enqueue(intent("BUY", 3_000_000n));
    await engine.enqueue(intent("BUY", 3_000_000n));
    const processed = await engine.enqueueAndProcess(intent("BUY", 3_000_010n));
    const venue = processed.batch!.metrics.venueSharesMicros;
    expect(venue).toBeGreaterThan(0n);
    expect(sum(processed.allocations.map((row) => row.executedSharesMicros))).toBe(venue);
    expect(processed.allocations.every((row) => row.status === "partial")).toBe(true);
  });
});

describe("Smart Execution: book-driven strategy and limits", () => {
  it("caps the aggregated limit at touch + max slippage even when user limits are looser", async () => {
    const deep = () =>
      book({ asks: [{ price: "0.50", size: "5" }, { price: "0.53", size: "5" }, { price: "0.70", size: "1000" }] });
    const { engine, requests } = setup((r) => fill(r), { book: deep, config: { maxSlippageBps: 500 } });
    const processed = await engine.enqueueAndProcess(intent("BUY", 50_000_000n, { limitPriceBps: 9000 }));
    expect(requests.length).toBeGreaterThan(0);
    expect(Math.max(...requests.map((r) => r.limitPriceBps))).toBeLessThanOrEqual(5500);
    expect(sum(requests.map((r) => r.sharesMicros))).toBe(10_000_000n); // only depth inside the cap
    expect(processed.allocation?.status).toBe("partial");
  });

  it("refuses to trade into a spread wider than the limit", async () => {
    const wide = () => book({ asks: [{ price: "0.90", size: "100" }], bids: [{ price: "0.10", size: "100" }] });
    const { engine, requests } = setup((r) => fill(r), { book: wide, config: { maxSpreadBps: 2000 } });
    const processed = await engine.enqueueAndProcess(intent("BUY", 1_000_000n, { limitPriceBps: 9500, quotedPriceBps: 9000 }));
    expect(requests).toHaveLength(0);
    expect(processed.allocation).toMatchObject({ status: "failed", errorCode: "WIDE_SPREAD" });
  });

  it("splits large orders into slices; a later rejected slice keeps earlier fills", async () => {
    const { engine, requests } = setup((r, n) => (n === 1 ? fill(r) : fill(r, 0)), {
      book: () => book({ asks: [{ price: "0.50", size: "100000" }] }),
      config: { maxSliceSharesMicros: 4_000_000n },
    });
    const processed = await engine.enqueueAndProcess(intent("BUY", 10_000_000n));
    expect(requests.length).toBe(3);
    expect(requests.every((r) => r.sharesMicros <= 4_000_000n)).toBe(true);
    expect(processed.allocation).toMatchObject({ status: "partial", executedSharesMicros: 4_000_000n });
  });

  it("judges stale quotes per intent: fresh orders execute, stale ones fail untouched", async () => {
    const { engine, requests } = setup((r) => fill(r));
    const stale = intent("BUY", 5_000_000n, { quotedPriceBps: 4000 });
    await engine.enqueue(stale);
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n, { quotedPriceBps: 5000 }));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.sharesMicros).toBe(2_000_000n);
    expect(processed.allocation?.status).toBe("filled");
    expect(processed.allocations.find((row) => row.executionId === stale.executionId)).toMatchObject({
      status: "failed",
      errorCode: "STALE_PRICE",
      executedSharesMicros: 0n,
    });
  });

  it("a stale order book fails the batch without contacting the venue", async () => {
    const old = () => book({ timestamp: String(Date.now() - 60_000) });
    const { engine, requests } = setup((r) => fill(r), { book: old });
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    expect(requests).toHaveLength(0);
    expect(processed.allocation).toMatchObject({ status: "failed", errorCode: "STALE_BOOK" });
  });
});

describe("Smart Execution: venue failures", () => {
  it("a non-retryable rejection is attempted once", async () => {
    const { engine, requests } = setup((r) => ({ ...fill(r, 0), status: "rejected", polymarketOrderId: null, errorMessage: "invalid tick" }));
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    expect(requests).toHaveLength(1);
    expect(processed.allocation).toMatchObject({ status: "failed", executedSharesMicros: 0n });
  });

  it("retryable refusals stop at maxAttempts", async () => {
    const { engine, requests } = setup((r) => ({ ...fill(r, 0), status: "rejected", polymarketOrderId: null, retryable: true }), {
      config: { maxAttempts: 3 },
    });
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    expect(requests).toHaveLength(3);
    expect(processed.allocation?.status).toBe("failed");
  });

  it("a thrown venue call is an unknown outcome: not retried, left pending, slice recorded before the call", async () => {
    let sliceStatusDuringCall: string | undefined;
    const { engine, store, requests } = setup(async () => {
      const batchId = (await store.listBatchIdsByStatus("SUBMITTED"))[0]!;
      sliceStatusDuringCall = (await store.getBatch(batchId))!.slices[0]?.status;
      throw new Error("socket hang up");
    });
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    expect(requests).toHaveLength(1);
    expect(sliceStatusDuringCall).toBe("unknown");
    expect(processed.allocation?.status).toBe("pending");
    expect(processed.batch?.status).toBe("SUBMITTED");
  });

  it("withTimeout turns a hung venue call into an unknown outcome", async () => {
    await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toBeInstanceOf(VenueTimeoutError);
    await expect(withTimeout(Promise.resolve(7), 20)).resolves.toBe(7);
  });

  it("an unknown order with no id closes with zero fills only when the venue shows no activity", async () => {
    let activity = { openOrderIds: [] as string[], tradeOrderIds: ["someone-else-order"] };
    const { engine } = setup(
      (r) => ({ ...fill(r, 0), status: "unknown", polymarketOrderId: null, errorMessage: "timeout" }),
      { config: { unknownOrderGraceMs: 10_000 }, client: { findActivity: async () => activity } },
    );
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    const batchId = processed.batch!.id;
    // Inside the grace period: nothing is decided.
    expect((await engine.reconcileBatch(batchId))?.batch.status).toBe("SUBMITTED");

    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
      // Unattributed venue activity: keep it open for review.
      expect((await engine.reconcileBatch(batchId))?.batch.status).toBe("SUBMITTED");
      activity = { openOrderIds: [], tradeOrderIds: [] };
      const done = await engine.reconcileBatch(batchId);
      expect(done?.batch.status).toBe("FAILED");
      expect(done?.allocations[0]).toMatchObject({ status: "failed", executedSharesMicros: 0n });
    } finally {
      Date.now = realNow;
    }
  });

  it("a reconciler cannot touch a batch while its run is still sending", async () => {
    const ref: { other?: ExecutionEngine } = {};
    let midRun: unknown;
    const { engine, store, client } = setup(async (r) => {
      midRun = await ref.other!.reconcileSubmitted();
      return fill(r);
    });
    ref.other = new ExecutionEngine(client, store, defaultExecutionEngineConfig);
    const processed = await engine.enqueueAndProcess(intent("BUY", 2_000_000n));
    expect(midRun).toEqual([]);
    expect(processed.allocation).toMatchObject({ status: "filled", executedSharesMicros: 2_000_000n });
  });
});
