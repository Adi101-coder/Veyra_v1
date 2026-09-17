import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { coreMarkets, type Market } from "@/lib/markets";
import {
  bettingForecastSource,
  changeConfidence,
  createPrismaDeps,
  enqueueMarketResolution,
  getUserReputation,
  placePrediction,
  reconcileExecutions,
  type BettingDeps,
} from "@/server/betting/service";
import { prismaBettingStore } from "@/server/betting/repository";
import { ReputationEngine } from "@/server/reputation/engine";
import { formatBrier } from "@/server/reputation/metrics";
import { prismaReputationStore } from "@/server/reputation/store";
import type { ReputationStore } from "@/server/reputation/types";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";

/**
 * Prediction reputation against a migrated SQLite database and a scripted venue.
 * `assertAggregates` recomputes every wallet aggregate from PredictionScore rows, so
 * any double counting or lost increment shows up as a mismatch.
 */

let dir: string;
let prisma: PrismaClient;
let seq = 0;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "veyra-rep-"));
  const url = `file:${path.join(dir, "rep.db")}`;
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

type Script = (request: VenueOrderRequest) => VenueOrderResult;
let tradeSeq = 0;
function venueFill(request: VenueOrderRequest, options: { fraction?: number; priceBps?: number; feeMicros?: bigint } = {}): VenueOrderResult {
  tradeSeq += 1;
  const fraction = options.fraction ?? 1;
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 100))) / 100n;
  const price = options.priceBps ?? (request.side === "BUY" ? 5000 : 4900);
  return {
    mode: "live",
    status: fraction >= 1 ? "filled" : shares > 0n ? "partial" : "rejected",
    polymarketOrderId: `o-${tradeSeq}`,
    response: {},
    fills: shares > 0n ? [{ priceBps: price, sharesMicros: shares, notionalMicros: (shares * BigInt(price)) / 10_000n, feeMicros: options.feeMicros ?? 0n, venueTradeId: `t-${tradeSeq}`, simulated: false }] : [],
    errorMessage: shares > 0n ? null : "no fill",
  };
}

function world() {
  seq += 1;
  const markets = new Map<string, Market>();
  const resolutions = new Map<string, "YES" | "NO" | "INVALID">();
  const orders = new Map<string, VenueOrderResult>();
  const venue: { script: Script } = { script: (r) => venueFill(r) };
  const market = (outcome?: "YES" | "NO" | "INVALID") => {
    const id = `rep-${seq}-${markets.size + 1}`;
    markets.set(id, { ...coreMarkets[0]!, id, category: "crypto", source: "polymarket", status: "open", openSeats: 1, clobTokenIds: ["tok-yes", "tok-no"] });
    if (outcome) resolutions.set(id, outcome);
    return id;
  };
  const deps = (): BettingDeps =>
    createPrismaDeps(prisma, {
      client: createPolymarketClient({
        mode: "live",
        getBook: async () => book(),
        submitOrder: async (request) => venue.script(request),
        getOrder: async (id) => orders.get(id) ?? null,
      }),
      getCatalogMarket: () => null,
      getLiveMarket: async (id) => markets.get(id) ?? null,
      getResolution: async (id) => {
        const outcome = resolutions.get(id);
        return outcome ? { resolved: true, outcome } : { resolved: false };
      },
    });
  let walletSeq = 0;
  const wallet = () => `0x${seq.toString(16).padStart(8, "0")}${(walletSeq += 1).toString(16).padStart(32, "0")}`;
  let keySeq = 0;
  const bet = (marketId: string, walletAddress: string, outcome: "YES" | "NO", confidencePct: number) =>
    placePrediction(
      { marketId, outcome, confidencePct, stakeUsd: "100.00", walletAddress, idempotencyKey: `rep-key-${seq}-${(keySeq += 1).toString().padStart(4, "0")}` },
      deps(),
    );
  const engine = (store: ReputationStore = prismaReputationStore(prisma), options: ConstructorParameters<typeof ReputationEngine>[2] = {}) =>
    new ReputationEngine(store, bettingForecastSource(prismaBettingStore(prisma)), options);
  const resolve = async (marketId: string) => enqueueMarketResolution(marketId, undefined, deps());
  return { market, deps, wallet, bet, engine, resolve, venue, orders, resolutions };
}

async function assertAggregates(walletAddress: string) {
  const scores = await prisma.predictionScore.findMany({ where: { walletAddress } });
  const row = await prisma.userReputation.findUnique({ where: { walletAddress }, include: { bins: true, categories: true } });
  if (!scores.length) {
    expect(row?.resolvedPredictions ?? 0).toBe(0);
    return;
  }
  expect(row!.resolvedPredictions).toBe(scores.length);
  expect(row!.correctPredictions).toBe(scores.filter((s) => s.correct).length);
  expect(row!.brierSumMicros).toBe(scores.reduce((sum, s) => sum + s.brierMicros, 0n));
  expect(row!.confidenceSumBps).toBe(scores.reduce((sum, s) => sum + BigInt(s.confidenceBps), 0n));
  expect(row!.notionalSumMicros).toBe(scores.reduce((sum, s) => sum + s.notionalMicros, 0n));
  expect(row!.pnlSumMicros).toBe(scores.reduce((sum, s) => sum + s.pnlMicros, 0n));
  expect(row!.bins.reduce((sum, bin) => sum + bin.sampleCount, 0)).toBe(scores.length);
  expect(row!.categories.reduce((sum, cat) => sum + cat.resolvedPredictions, 0)).toBe(scores.length);
}

describe("Prediction reputation (Prisma)", () => {
  it("Brier, accuracy and calibration are exact for YES and NO predictions", async () => {
    const w = world();
    const yesMarket = w.market("YES");
    const noMarket = w.market("NO");
    const alice = w.wallet();
    const bob = w.wallet();
    await w.bet(yesMarket, alice, "YES", 90); // correct 90%: 0.01
    await w.bet(noMarket, alice, "YES", 90); // incorrect 90%: 0.81
    await w.bet(yesMarket, bob, "NO", 60); // incorrect 60% (implied YES 0.40): 0.36
    await w.bet(noMarket, bob, "NO", 60); // correct 60%: 0.16
    await w.resolve(yesMarket);
    await w.resolve(noMarket);
    await w.engine().processJobs();

    const scores = await prisma.predictionScore.findMany({ where: { walletAddress: { in: [alice, bob] } } });
    const brier = (wallet: string, marketId: string) => formatBrier(scores.find((s) => s.walletAddress === wallet && s.marketId === marketId)!.brierMicros);
    expect(brier(alice, yesMarket)).toBe("0.010000");
    expect(brier(alice, noMarket)).toBe("0.810000");
    expect(brier(bob, yesMarket)).toBe("0.360000");
    expect(brier(bob, noMarket)).toBe("0.160000");

    const a = await getUserReputation(alice, w.deps());
    expect(a).toMatchObject({ resolvedPredictions: 2, correctPredictions: 1, accuracy: 0.5, averageConfidencePct: 90, brierScore: "0.410000" });
    expect(a.calibration.bins).toEqual([expect.objectContaining({ sampleCount: 2 })]);
    expect(a.calibration.ece).toBeCloseTo(0.4, 10);
    const b = await getUserReputation(bob, w.deps());
    expect(b).toMatchObject({ resolvedPredictions: 2, correctPredictions: 1, brierScore: "0.260000" });
    await assertAggregates(alice);
    await assertAggregates(bob);
  });

  it("only filled positions are scored; zero-fill and never-trading users get a clean empty state", async () => {
    const w = world();
    const m = w.market("YES");
    const filledWallet = w.wallet();
    const zeroFill = w.wallet();
    const stranger = w.wallet();
    await w.bet(m, filledWallet, "YES", 80);
    w.venue.script = () => ({ mode: "live", status: "rejected", polymarketOrderId: null, response: {}, fills: [], errorMessage: "rejected" });
    const failed = await w.bet(m, zeroFill, "YES", 80);
    expect(failed.position?.status).toBe("failed");
    await w.resolve(m);
    await w.engine().processJobs();

    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(1);
    const empty = await getUserReputation(zeroFill, w.deps());
    const never = await getUserReputation(stranger, w.deps());
    for (const reputation of [empty, never]) {
      expect(reputation).toMatchObject({
        totalPredictions: 0,
        resolvedPredictions: 0,
        correctPredictions: 0,
        accuracy: null,
        averageConfidencePct: null,
        brierScore: null,
        roi: null,
        calibration: { ece: null, bins: [] },
        categories: [],
      });
    }
    expect((await getUserReputation(filledWallet, w.deps())).totalPredictions).toBe(1);
  });

  it("partial fills, sell proceeds and fees are all in PnL", async () => {
    const w = world();
    const m = w.market("YES");
    const wallet = w.wallet();
    // Opening BUY: half fills at 0.50 with a $0.10 fee.
    w.venue.script = (r) => venueFill(r, { fraction: 0.5, priceBps: 5000, feeMicros: 100_000n });
    const opened = await w.bet(m, wallet, "YES", 80);
    const buy = await prisma.fill.findFirstOrThrow({ where: { execution: { position: { predictionId: opened.id } } } });
    // Change 80 -> 60: SELL fills at 0.49 with a $0.05 fee.
    w.venue.script = (r) => venueFill(r, { priceBps: 4900, feeMicros: 50_000n });
    const changed = await changeConfidence(opened.id, { confidencePct: 60, walletAddress: wallet, idempotencyKey: `sell-${seq}-000001` }, w.deps());
    expect(changed.history.side).toBe("SELL");
    const sell = await prisma.fill.findFirstOrThrow({ where: { execution: { side: "SELL", position: { predictionId: opened.id } } } });

    await w.resolve(m);
    await w.engine().processJobs();
    const score = await prisma.predictionScore.findUniqueOrThrow({ where: { predictionId: opened.id } });
    const cost = buy.notionalMicros + buy.feeMicros;
    const proceeds = sell.notionalMicros - sell.feeMicros;
    const held = buy.sharesMicros - sell.sharesMicros;
    expect(score.notionalMicros).toBe(cost);
    expect(score.payoutMicros).toBe(held);
    expect(score.pnlMicros).toBe(held + proceeds - cost);
    expect(score.confidenceBps).toBe(6000);
    await assertAggregates(wallet);
  });

  it("uses the confidence at the exact cutoff and ignores late bets, late adjustments and post-cutoff executions", async () => {
    const w = world();
    const m = w.market("YES");
    const wallet = w.wallet();
    const opened = await w.bet(m, wallet, "YES", 80);
    await changeConfidence(opened.id, { confidencePct: 60, walletAddress: wallet, idempotencyKey: `cut-${seq}-000001` }, w.deps());
    const job = await w.resolve(m);
    const cutoff = job.createdAt;

    // Tamper as a buggy/late writer would after the cutoff.
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });
    await prisma.confidenceHistory.create({
      data: {
        predictionId: opened.id, previousConfidenceBps: 6000, newConfidenceBps: 1000, previousSharesMicros: 0n, previousNotionalMicros: 0n,
        previousAvgPriceBps: 0, previousPositionJson: "{}", desiredSharesMicros: 0n, desiredNotionalMicros: 0n, desiredAvgPriceBps: 0,
        desiredPositionJson: "{}", deltaSharesMicros: 0n, side: "NONE", marketPriceBps: 5000, status: "filled", previousPositionStatus: "filled",
        createdAt: new Date(cutoff.getTime() + 1_000),
      },
    });
    await prisma.prediction.update({ where: { id: opened.id }, data: { confidenceBps: 1000 } });
    await prisma.execution.create({
      data: {
        positionId: position.id, venue: "polymarket", mode: "live", status: "filled", tokenId: "tok-yes", side: "BUY", orderType: "FAK",
        limitPriceBps: 5000, sizeSharesMicros: 99_000_000n, notionalMicros: 49_500_000n, requestJson: "{}", createdAt: new Date(cutoff.getTime() + 1_000),
        fills: { create: { venueTradeId: "late-trade", priceBps: 5000, sharesMicros: 99_000_000n, notionalMicros: 49_500_000n } },
      },
    });
    const late = await prisma.prediction.create({
      data: {
        walletAddress: wallet, marketId: m, outcome: "YES", confidenceBps: 9900, stakeMicros: 1_000_000n, marketPriceBps: 5000, engineVersion: "v1",
        engineInputJson: "{}", engineOutputJson: "{}", status: "accepted", createdAt: new Date(cutoff.getTime() + 1_000),
        position: {
          create: {
            marketId: m, walletAddress: wallet, outcome: "YES", side: "BUY", tokenId: "tok-yes", sharesMicros: 1_000_000n, limitPriceBps: 5000,
            avgPriceBps: 5000, notionalMicros: 500_000n, payoutMicros: 1_000_000n, edgeBps: 0, kellyBps: 0, status: "filled",
            executions: {
              create: {
                venue: "polymarket", mode: "live", status: "filled", tokenId: "tok-yes", side: "BUY", orderType: "FAK", limitPriceBps: 5000,
                sizeSharesMicros: 1_000_000n, notionalMicros: 500_000n, requestJson: "{}",
                fills: { create: { venueTradeId: "late-bet", priceBps: 5000, sharesMicros: 1_000_000n, notionalMicros: 500_000n } },
              },
            },
          },
        },
      },
    });

    await w.engine().processJobs();
    const score = await prisma.predictionScore.findUniqueOrThrow({ where: { predictionId: opened.id } });
    expect(score.confidenceBps).toBe(6000);
    const lateFill = 99_000_000n;
    expect(score.payoutMicros < lateFill).toBe(true);
    expect(await prisma.predictionScore.findUnique({ where: { predictionId: late.id } })).toBeNull();
    await expect(
      changeConfidence(opened.id, { confidencePct: 40, walletAddress: wallet, idempotencyKey: `cut-${seq}-000002` }, w.deps()),
    ).rejects.toMatchObject({ code: "MARKET_RESOLVED" });
    await assertAggregates(wallet);
  });

  it("defers scoring while pre-cutoff orders are unreconciled, then scores the real fills", async () => {
    const w = world();
    const m = w.market("YES");
    const wallet = w.wallet();
    w.venue.script = () => ({ mode: "live", status: "open", polymarketOrderId: `rest-${seq}`, response: {}, fills: [], errorMessage: null });
    const opened = await w.bet(m, wallet, "YES", 80);
    expect(opened.position?.status).toBe("pending");
    await w.resolve(m);

    let clock = Date.now();
    const engine = w.engine(undefined, { now: () => clock, retryDelayMs: 1_000 });
    expect(await engine.processJobs()).toMatchObject([{ deferred: true }]);
    expect(await engine.processJobs()).toEqual([]); // not claimable before availableAt
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(0);

    // The resting order filled before resolution; reconciliation records it.
    const execution = await prisma.execution.findFirstOrThrow({ where: { position: { predictionId: opened.id } } });
    w.orders.set(`rest-${seq}`, { ...venueFill({ side: "BUY", sharesMicros: execution.sizeSharesMicros } as VenueOrderRequest), polymarketOrderId: `rest-${seq}` });
    await reconcileExecutions(w.deps());
    clock += 2_000;
    await prisma.reputationJob.updateMany({ where: { marketId: m }, data: { availableAt: new Date(0) } });
    await engine.processJobs();
    const score = await prisma.predictionScore.findUniqueOrThrow({ where: { predictionId: opened.id } });
    expect(score.payoutMicros).toBe(execution.sizeSharesMicros);
    expect((await getUserReputation(wallet, w.deps())).totalPredictions).toBe(1); // late fill counted as opened
    await assertAggregates(wallet);
  });

  it("stops deferring after the bound and never scores the still-unfilled order", async () => {
    const w = world();
    const m = w.market("YES");
    const wallet = w.wallet();
    await w.bet(m, wallet, "YES", 80);
    w.venue.script = () => ({ mode: "live", status: "open", polymarketOrderId: `stuck-${seq}`, response: {}, fills: [], errorMessage: null });
    const stuck = await w.bet(m, w.wallet(), "YES", 70);
    const job = await w.resolve(m);
    await w.engine(undefined, { now: () => job.createdAt.getTime() + 25 * 60 * 60 * 1000 }).processJobs();
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(1);
    expect(await prisma.predictionScore.findUnique({ where: { predictionId: stuck.id } })).toBeNull();
    expect((await prisma.reputationJob.findUniqueOrThrow({ where: { marketId: m } })).status).toBe("DONE");
  });

  it("invalid and unresolved markets never produce scores", async () => {
    const w = world();
    const invalid = w.market("INVALID");
    const open = w.market();
    const wallet = w.wallet();
    await w.bet(invalid, wallet, "YES", 80);
    await w.bet(open, wallet, "NO", 70);
    await w.resolve(invalid);
    await expect(w.resolve(open)).rejects.toMatchObject({ code: "NOT_RESOLVED" });
    await w.engine().processJobs();
    expect(await prisma.predictionScore.count({ where: { walletAddress: wallet } })).toBe(0);
    const reputation = await getUserReputation(wallet, w.deps());
    expect(reputation).toMatchObject({ resolvedPredictions: 0, brierScore: null, accuracy: null, roi: null });
    expect((await prisma.market.findUniqueOrThrow({ where: { id: invalid } })).resolvedOutcome).toBe("INVALID");
  });

  it("concurrent and repeated scoring is idempotent", async () => {
    const w = world();
    const m = w.market("YES");
    const wallets = [w.wallet(), w.wallet(), w.wallet()];
    for (const wallet of wallets) await w.bet(m, wallet, "YES", 75);
    await Promise.all([w.resolve(m), w.resolve(m), w.resolve(m)]);
    await Promise.all([w.engine().processJobs(), w.engine().processJobs(), w.engine().processJobs()]);
    // Force a second full pass over an already-scored market.
    await prisma.reputationJob.updateMany({ where: { marketId: m }, data: { status: "QUEUED", availableAt: null } });
    await Promise.all([w.engine().processJobs(), w.engine().processJobs()]);
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(3);
    for (const wallet of wallets) {
      expect((await getUserReputation(wallet, w.deps())).resolvedPredictions).toBe(1);
      await assertAggregates(wallet);
    }
  });

  it("recovers from a worker failing mid-job and from a crashed claim without double counting", async () => {
    const w = world();
    const m = w.market("NO");
    const wallets = [w.wallet(), w.wallet(), w.wallet(), w.wallet()];
    for (const wallet of wallets) await w.bet(m, wallet, "YES", 65);
    await w.resolve(m);

    // Database hiccup on the third score: job requeues with backoff; first two stay scored.
    const real = prismaReputationStore(prisma);
    let calls = 0;
    const flaky: ReputationStore = {
      ...real,
      applyResolution: async (score) => {
        calls += 1;
        if (calls === 3) throw new Error("SQLITE_BUSY: database is locked");
        return real.applyResolution(score);
      },
    };
    let clock = Date.now();
    await w.engine(flaky, { now: () => clock, retryDelayMs: 1_000 }).processJobs();
    let job = await prisma.reputationJob.findUniqueOrThrow({ where: { marketId: m } });
    expect(job).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(2);

    // A worker then crashes holding the claim (PROCESSING with an old claimedAt).
    await prisma.reputationJob.update({ where: { id: job.id }, data: { status: "PROCESSING", claimedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    clock += 5_000;
    await w.engine(undefined, { now: () => clock }).processJobs();
    job = await prisma.reputationJob.findUniqueOrThrow({ where: { marketId: m } });
    expect(job.status).toBe("DONE");
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(4);
    for (const wallet of wallets) await assertAggregates(wallet);
  });

  it("gives up after max attempts and a later enqueue retries from a clean slate", async () => {
    const w = world();
    const m = w.market("YES");
    const wallet = w.wallet();
    await w.bet(m, wallet, "YES", 80);
    await w.resolve(m);
    const broken: ReputationStore = { ...prismaReputationStore(prisma), applyResolution: async () => { throw new Error("disk full"); } };
    let clock = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await w.engine(broken, { now: () => clock, retryDelayMs: 1, maxAttempts: 3 }).processJobs();
      clock += 10_000;
      await prisma.reputationJob.updateMany({ where: { marketId: m, status: "QUEUED" }, data: { availableAt: new Date(0) } });
    }
    expect(await prisma.reputationJob.findUniqueOrThrow({ where: { marketId: m } })).toMatchObject({ status: "FAILED", attempts: 2 });
    await w.resolve(m); // re-enqueue resets the failed job
    await w.engine().processJobs();
    expect(await prisma.predictionScore.count({ where: { marketId: m } })).toBe(1);
    await assertAggregates(wallet);
  });
});
