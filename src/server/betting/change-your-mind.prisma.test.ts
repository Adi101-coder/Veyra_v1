import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { coreMarkets, type Market } from "@/lib/markets";
import {
  changeConfidence,
  createPrismaDeps,
  enqueueMarketResolution,
  getUserReputation,
  placePrediction,
  processReputationJobs,
  reconcileExecutions,
  recoverStuckAdjustments,
  syncExecution,
  type BettingDeps,
} from "@/server/betting/service";
import { prismaBettingStore } from "@/server/betting/repository";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";

/**
 * Change Your Mind on a real migrated SQLite database with a scripted Polymarket.
 * Invariant checked after every scenario: position shares == BUY fills - SELL fills,
 * and prediction confidence == the last *filled/noop* history value.
 */

let dir: string;
let prisma: PrismaClient;
let marketSeq = 0;
let walletSeq = 0;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "veyra-cym-"));
  const url = `file:${path.join(dir, "cym.db")}`;
  execFileSync(path.resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const book = (): OrderBookSnapshot => ({
  tokenId: "tok-yes",
  asks: [{ price: "0.50", size: "100000" }],
  bids: [{ price: "0.49", size: "100000" }],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "polymarket",
  timestamp: String(Date.now()),
  hash: "book",
});

type Venue = {
  script: (request: VenueOrderRequest) => VenueOrderResult | Promise<VenueOrderResult>;
  orders: Map<string, VenueOrderResult>;
  submits: VenueOrderRequest[];
  resolved: boolean;
};

let orderSeq = 0;
function filled(request: VenueOrderRequest, fraction = 1): VenueOrderResult {
  orderSeq += 1;
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 100))) / 100n;
  const price = request.side === "BUY" ? 5000 : 4900;
  return {
    mode: "live",
    status: fraction >= 1 ? "filled" : shares > 0n ? "partial" : "rejected",
    polymarketOrderId: `ord-${orderSeq}`,
    response: {},
    fills: shares > 0n ? [{ priceBps: price, sharesMicros: shares, notionalMicros: (shares * BigInt(price)) / 10_000n, feeMicros: 0n, venueTradeId: `trd-${orderSeq}`, simulated: false }] : [],
    errorMessage: shares > 0n ? null : "no fill",
  };
}
const resting = (id: string): VenueOrderResult => ({ mode: "live", status: "open", polymarketOrderId: id, response: {}, fills: [], errorMessage: null });
const rejected = (): VenueOrderResult => ({ mode: "live", status: "rejected", polymarketOrderId: null, response: {}, fills: [], errorMessage: "not enough balance" });

function scenario() {
  marketSeq += 1;
  walletSeq += 1;
  const market: Market = { ...coreMarkets[0]!, id: `cym-market-${marketSeq}`, source: "polymarket", status: "open", openSeats: 1, clobTokenIds: ["tok-yes", "tok-no"] };
  const wallet = `0x${walletSeq.toString(16).padStart(40, "c")}`;
  const venue: Venue = { script: (r) => filled(r), orders: new Map(), submits: [], resolved: false };
  const makeDeps = (): BettingDeps =>
    createPrismaDeps(prisma, {
      client: createPolymarketClient({
        mode: "live",
        getBook: async () => book(),
        submitOrder: async (request) => {
          venue.submits.push(request);
          return venue.script(request);
        },
        getOrder: async (id) => venue.orders.get(id) ?? null,
      }),
      getCatalogMarket: () => null,
      getLiveMarket: async (id) => (id === market.id ? market : null),
      getResolution: async () => (venue.resolved ? { resolved: true, outcome: "YES" } : { resolved: false }),
    });
  let keySeq = 0;
  const key = () => `${market.id}-key-${(keySeq += 1).toString().padStart(4, "0")}`;
  const open = async (deps = makeDeps()) =>
    placePrediction({ marketId: market.id, outcome: "YES", confidencePct: 80, stakeUsd: "100.00", walletAddress: wallet, idempotencyKey: key() }, deps);
  const change = (predictionId: string, confidencePct: number, deps = makeDeps(), idempotencyKey = key()) =>
    changeConfidence(predictionId, { confidencePct, walletAddress: wallet, idempotencyKey }, deps);
  return { market, wallet, venue, makeDeps, open, change, key };
}

async function assertLedger(predictionId: string) {
  const prediction = await prisma.prediction.findUniqueOrThrow({
    where: { id: predictionId },
    include: { position: { include: { executions: { include: { fills: true } } } }, confidenceHistory: { orderBy: { createdAt: "asc" } } },
  });
  let shares = 0n;
  for (const execution of prediction.position!.executions) {
    for (const fill of execution.fills) shares += execution.side === "SELL" ? -fill.sharesMicros : fill.sharesMicros;
  }
  expect(shares >= 0n).toBe(true); // never sold more than was bought
  expect(prediction.position!.sharesMicros).toBe(shares);
  const settled = prediction.confidenceHistory.filter((row) => row.status === "filled" || row.status === "noop");
  expect(prediction.confidenceBps).toBe(settled.at(-1)?.newConfidenceBps ?? 8000);
  for (const row of prediction.confidenceHistory) {
    if (!row.executionId) continue;
    const execution = prediction.position!.executions.find((item) => item.id === row.executionId)!;
    const executionShares = execution.fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
    if (row.status === "failed") expect(executionShares).toBe(0n);
    if (row.status === "pending") expect(["submitted", "created", "open", "unknown"]).toContain(execution.status);
  }
  return prediction;
}

describe("Change Your Mind lifecycle under concurrency (Prisma)", () => {
  it("80% -> 60% -> 40% in rapid succession stays consistent", async () => {
    const s = scenario();
    const opened = await s.open();
    const first = await s.change(opened.id, 60);
    const second = await s.change(opened.id, 40);
    expect(first.history.status).toBe("filled");
    expect(second.history.status).toBe("filled");
    expect(second.history.previousConfidencePct).toBe(60);
    const prediction = await assertLedger(opened.id);
    expect(prediction.confidenceBps).toBe(4000);
    expect(prediction.position!.status).toBe("closed"); // 40% has no edge vs a 50c ask: flattened
    expect(prediction.confidenceHistory).toHaveLength(2);
  });

  it("concurrent adjustments: exactly one executes, the rest are rejected without side effects", async () => {
    const s = scenario();
    const opened = await s.open();
    const submitsBefore = s.venue.submits.length;
    s.venue.script = async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return filled(r);
    };
    const results = await Promise.allSettled([60, 70, 90, 55, 65].map((pct) => s.change(opened.id, pct)));
    const ok = results.filter((row) => row.status === "fulfilled");
    const rejectedRows = results.filter((row): row is PromiseRejectedResult => row.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejectedRows.every((row) => row.reason.code === "CONCURRENT_UPDATE")).toBe(true);
    expect(s.venue.submits.length - submitsBefore).toBe(1);
    const prediction = await assertLedger(opened.id);
    expect(prediction.confidenceHistory).toHaveLength(1);
    expect(prediction.position!.status).toBe("filled");
  });

  it("the same idempotency key submitted concurrently yields at most one adjustment", async () => {
    const s = scenario();
    const opened = await s.open();
    const submitsBefore = s.venue.submits.length;
    const sameKey = s.key();
    const results = await Promise.allSettled([0, 1, 2].map(() => s.change(opened.id, 60, s.makeDeps(), sameKey)));
    const ids = new Set(results.flatMap((row) => (row.status === "fulfilled" ? [row.value.history.id] : [])));
    expect(ids.size).toBe(1);
    for (const row of results) if (row.status === "rejected") expect((row.reason as { code: string }).code).toBe("CONCURRENT_UPDATE");
    expect(s.venue.submits.length - submitsBefore).toBe(1);
    // A later retry with the key replays.
    const replay = await s.change(opened.id, 60, s.makeDeps(), sameKey);
    expect(ids.has(replay.history.id)).toBe(true);
    expect((await assertLedger(opened.id)).confidenceHistory).toHaveLength(1);
  });

  it("a partial adjustment moves only the filled shares, keeps confidence, and releases the lock", async () => {
    const s = scenario();
    const opened = await s.open();
    const before = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });
    s.venue.script = (r) => filled(r, 0.5);
    const partial = await s.change(opened.id, 60);
    expect(partial.history.status).toBe("partial");
    expect(partial.prediction.confidencePct).toBe(80);
    const after = await assertLedger(opened.id);
    expect(after.position!.sharesMicros).toBeLessThan(before.sharesMicros);
    expect(after.position!.status).toBe("filled");
    // The next change plans from what is actually held.
    s.venue.script = (r) => filled(r);
    const next = await s.change(opened.id, 60);
    expect(next.history.previousPosition.shares).toBe(partial.prediction.position!.shares);
    expect(next.history.status).toBe("filled");
    await assertLedger(opened.id);
  });

  it("a resting adjustment holds the lock and changes nothing until real fills are reconciled once", async () => {
    const s = scenario();
    const opened = await s.open();
    const before = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });
    s.venue.script = () => resting("rest-adj-1");
    const pending = await s.change(opened.id, 60);
    expect(pending.history.status).toBe("pending");
    expect(pending.prediction.confidencePct).toBe(80);
    expect(pending.prediction.position?.status).toBe("adjusting");
    expect((await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } })).sharesMicros).toBe(before.sharesMicros);
    await expect(s.change(opened.id, 40)).rejects.toMatchObject({ code: "CONCURRENT_UPDATE" });
    await assertLedger(opened.id);

    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: pending.prediction.execution!.id } });
    s.venue.orders.set("rest-adj-1", { ...filled({ side: "SELL", sharesMicros: execution.sizeSharesMicros } as VenueOrderRequest), polymarketOrderId: "rest-adj-1" });
    // Multiple workers and the owner's sync race to reconcile the same adjustment.
    await Promise.all([reconcileExecutions(s.makeDeps()), reconcileExecutions(s.makeDeps()), syncExecution(execution.id, s.makeDeps()).catch(() => null)]);
    await reconcileExecutions(s.makeDeps());

    const after = await assertLedger(opened.id);
    expect(after.confidenceBps).toBe(6000);
    expect(after.confidenceHistory[0]!.status).toBe("filled");
    expect(after.position!.status).toBe("filled");
    expect(after.position!.sharesMicros).toBe(before.sharesMicros - execution.sizeSharesMicros);
    expect(await prisma.fill.count({ where: { executionId: execution.id } })).toBe(1);
  });

  it("a rejected adjustment leaves position and confidence untouched and releases the lock", async () => {
    const s = scenario();
    const opened = await s.open();
    const before = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });
    s.venue.script = () => rejected();
    const result = await s.change(opened.id, 60);
    expect(result.history.status).toBe("failed");
    const after = await assertLedger(opened.id);
    expect(after.position!.sharesMicros).toBe(before.sharesMicros);
    expect(after.position!.status).toBe("filled");
    expect(after.confidenceBps).toBe(8000);
    s.venue.script = (r) => filled(r);
    expect((await s.change(opened.id, 60)).history.status).toBe("filled");
  });

  it("an adjustment is refused while the opening order is still being reconciled", async () => {
    const s = scenario();
    s.venue.script = () => resting("rest-open-1");
    const opened = await s.open();
    expect(opened.position?.status).toBe("pending");
    await expect(s.change(opened.id, 60)).rejects.toMatchObject({ code: "POSITION_NOT_READY" });
    expect((await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } })).status).toBe("pending");
    expect(await prisma.confidenceHistory.count({ where: { predictionId: opened.id } })).toBe(0);
  });

  it("market resolves while an adjustment is resting: venue cancels it, scoring uses the pre-cutoff confidence", async () => {
    const s = scenario();
    const opened = await s.open();
    s.venue.script = () => resting("rest-close-1");
    const pending = await s.change(opened.id, 60);
    expect(pending.history.status).toBe("pending");

    s.venue.resolved = true;
    await enqueueMarketResolution(s.market.id, undefined, s.makeDeps());
    // Polymarket cancels resting orders when a market resolves.
    s.venue.orders.set("rest-close-1", { ...resting("rest-close-1"), status: "rejected", errorMessage: "CANCELED_MARKET_RESOLVED" });
    await reconcileExecutions(s.makeDeps());
    const after = await assertLedger(opened.id);
    expect(after.confidenceHistory[0]!.status).toBe("failed");
    expect(after.position!.status).toBe("filled");

    await processReputationJobs(s.makeDeps());
    const score = await prisma.predictionScore.findUniqueOrThrow({ where: { predictionId: opened.id } });
    expect(score.confidenceBps).toBe(8000);
    await expect(s.change(opened.id, 40)).rejects.toMatchObject({ code: "MARKET_RESOLVED" });
    expect((await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } })).status).toBe("filled");
    expect((await getUserReputation(s.wallet, s.makeDeps()))?.resolvedPredictions).toBe(1);
  });

  it("a crashed request never leaves a position locked or an adjustment half-applied", async () => {
    const s = scenario();
    const opened = await s.open();
    const store = prismaBettingStore(prisma);
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });

    // Crash right after taking the lock.
    expect(await store.claimAdjustmentLock(position.id)).toBe(true);
    expect(await store.claimAdjustmentLock(position.id)).toBe(false);
    await expect(s.change(opened.id, 60)).rejects.toMatchObject({ code: "CONCURRENT_UPDATE" });
    expect(await recoverStuckAdjustments(s.makeDeps(), -1_000)).toBe(1);
    expect((await prisma.position.findUniqueOrThrow({ where: { id: position.id } })).status).toBe("filled");

    // Crash after writing history + execution but before queueing it for the venue.
    expect(await store.claimAdjustmentLock(position.id)).toBe(true);
    const created = await store.createHistoryAndExecution({
      history: {
        predictionId: opened.id,
        previousConfidenceBps: 8000,
        newConfidenceBps: 6000,
        previousSharesMicros: position.sharesMicros,
        previousNotionalMicros: position.notionalMicros,
        previousAvgPriceBps: position.avgPriceBps,
        previousPositionJson: "{}",
        desiredSharesMicros: 1n,
        desiredNotionalMicros: 1n,
        desiredAvgPriceBps: 5000,
        desiredPositionJson: "{}",
        deltaSharesMicros: -1_000_000n,
        side: "SELL",
        marketPriceBps: 5000,
        bookHash: null,
        status: "pending",
        previousPositionStatus: "filled",
      },
      execution: {
        positionId: position.id,
        venue: "polymarket",
        mode: "live",
        status: "created",
        tokenId: "tok-yes",
        side: "SELL",
        orderType: "FAK",
        limitPriceBps: 4900,
        sizeSharesMicros: 1_000_000n,
        notionalMicros: 490_000n,
        requestJson: "{}",
      },
    });
    const submitsBefore = s.venue.submits.length;
    expect(await recoverStuckAdjustments(s.makeDeps(), -1_000)).toBe(1);
    expect(s.venue.submits.length).toBe(submitsBefore);
    const after = await assertLedger(opened.id);
    expect(after.position!.sharesMicros).toBe(position.sharesMicros);
    expect(after.position!.status).toBe("filled");
    expect(after.confidenceHistory.find((row) => row.id === created.history.id)!.status).toBe("failed");
    expect((await s.change(opened.id, 60)).history.status).toBe("filled");
    await assertLedger(opened.id);
  });

  it("recovery racing a real reconcile never counts the same shares twice (either order)", async () => {
    for (const order of ["venue-first", "recovery-first"] as const) {
      const s = scenario();
      const opened = await s.open();
      s.venue.script = () => resting(`race-${order}`);
      const pending = await s.change(opened.id, 60);
      const executionId = pending.prediction.execution!.id;
      const execution = await prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
      const deps = s.makeDeps();
      // The execution layer has finished (intent terminal) but the adjustment history is still pending.
      await prisma.executionIntent.update({
        where: { executionId },
        data: { status: "RECONCILED", executedSharesMicros: execution.sizeSharesMicros, executedNotionalMicros: execution.sizeSharesMicros / 2n, avgPriceBps: 5000 },
      });
      const realFill = {
        venueTradeId: `real-${order}`,
        priceBps: 4900,
        sharesMicros: execution.sizeSharesMicros,
        notionalMicros: (execution.sizeSharesMicros * 4900n) / 10_000n,
        feeMicros: 0n,
        isSimulated: false,
        rawJson: null,
      };
      const applyReal = () =>
        deps.store.applyExecutionResult(executionId, {
          status: "filled",
          polymarketOrderId: `race-${order}`,
          responseJson: "{}",
          errorMessage: null,
          submittedAt: new Date(),
          fills: [realFill],
        });
      if (order === "venue-first") {
        // Real fill recorded (settling history), then recovery sees a stale lock snapshot.
        await applyReal();
        await prisma.confidenceHistory.updateMany({ where: { executionId }, data: { status: "pending" } });
        await prisma.position.update({ where: { predictionId: opened.id }, data: { status: "adjusting" } });
        await recoverStuckAdjustments(deps, -1_000);
      } else {
        await recoverStuckAdjustments(deps, -1_000);
        await applyReal();
      }
      const after = await assertLedger(opened.id);
      const fills = after.position!.executions.find((row) => row.id === executionId)!.fills;
      expect(fills).toHaveLength(1);
      expect(after.position!.status).toBe("filled");
    }
  });
});
