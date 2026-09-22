import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { loadPoolConfig, type PoolConfig } from "@/server/pools/config";
import { poolBook, poolInventory, poolState } from "@/server/pools/book";
import { getPoolMarket } from "@/server/voting/pool";
import { closePoolLiquidity, fundBalances, openPoolLiquidity, seedFund } from "@/server/pools/fund";
import { maxLossMicros } from "@/server/pools/lmsr";
import { fundPendingPools, settleResolvedPools } from "@/server/pools/settlement";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const USD = 1_000_000n;
const CONFIG: PoolConfig = {
  ...loadPoolConfig({} as NodeJS.ProcessEnv),
  poolBudgetMicros: 250n * USD,
  minPoolBudgetMicros: 25n * USD,
  feeBps: 200,
};

const MARKET = "veyra-pool-1";
const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

beforeAll(() => {
  database = createTestDatabase("pools");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.predictionScore.deleteMany();
  await prisma.reputationJob.deleteMany();
  await prisma.liquidityFundEntry.deleteMany();
  await prisma.poolLiquidity.deleteMany();
  await prisma.position.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.market.deleteMany();
  await prisma.market.create({
    data: { id: MARKET, title: "Pool", category: "crypto", tag: "t", status: "open", source: "veyra" },
  });
});

/** A filled position, which is what the AMM's inventory is derived from. */
async function filledPosition(outcome: "YES" | "NO", shares: bigint, notional: bigint, who: number) {
  return prisma.prediction.create({
    data: {
      walletAddress: wallet(who),
      marketId: MARKET,
      outcome,
      confidenceBps: 7000,
      stakeMicros: notional,
      marketPriceBps: 5000,
      engineVersion: "v1",
      engineInputJson: "{}",
      engineOutputJson: "{}",
      status: "accepted",
      position: {
        create: {
          marketId: MARKET,
          walletAddress: wallet(who),
          outcome,
          side: "BUY",
          tokenId: `synthetic:${MARKET}:${outcome}`,
          sharesMicros: shares,
          limitPriceBps: 6000,
          avgPriceBps: 5000,
          notionalMicros: notional,
          payoutMicros: 0n,
          edgeBps: 100,
          kellyBps: 2500,
          status: "filled",
        },
      },
    },
  });
}

describe("Veyra pool liquidity (Prisma)", () => {
  it("cannot open a pool from an empty fund, and the pool stays unquotable", async () => {
    expect(await openPoolLiquidity(prisma, MARKET, null, CONFIG)).toBeNull();
    expect(await poolState(prisma, MARKET)).toBeNull();
    expect(await poolBook(prisma, MARKET, "YES", CONFIG)).toBeNull();
  });

  it("reserves only the pool's bounded worst case from the fund", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    const pool = await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    expect(pool).not.toBeNull();

    // The reservation is b*ln(2) and never exceeds the configured budget.
    expect(pool!.allocatedMicros).toBe(maxLossMicros(pool!.bMicros));
    expect(pool!.allocatedMicros).toBeLessThanOrEqual(CONFIG.poolBudgetMicros);
    expect(pool!.feeBps).toBe(200);

    const balances = await fundBalances(prisma);
    expect(balances.totalMicros).toBe(1_000n * USD);
    expect(balances.allocatedMicros).toBe(pool!.allocatedMicros);
    expect(balances.reserveMicros).toBe(1_000n * USD - pool!.allocatedMicros);
  });

  it("is idempotent: opening the same pool twice reserves once", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    const first = await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    const again = await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    expect(again!.id).toBe(first!.id);
    expect(await prisma.poolLiquidity.count()).toBe(1);
    const balances = await fundBalances(prisma);
    expect(balances.allocatedMicros).toBe(first!.allocatedMicros);
  });

  it("seeding the fund is idempotent per reference", async () => {
    expect(await seedFund(prisma, 500n * USD, "boot")).toEqual({ seeded: true });
    expect(await seedFund(prisma, 500n * USD, "boot")).toEqual({ seeded: false });
    expect((await fundBalances(prisma)).totalMicros).toBe(500n * USD);
  });

  it("stops opening pools once the reserve is exhausted", async () => {
    // Enough for one full-budget pool, with less than the minimum left over.
    await seedFund(prisma, 260n * USD, "seed-1");
    const first = await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    expect(first).not.toBeNull();

    await prisma.market.create({
      data: { id: "veyra-pool-2", title: "P2", category: "crypto", tag: "t", status: "open", source: "veyra" },
    });
    const second = await openPoolLiquidity(prisma, "veyra-pool-2", null, CONFIG);
    // What is left is below the minimum, so the second pool opens unfunded.
    expect(second).toBeNull();
    expect(await poolBook(prisma, "veyra-pool-2", "YES", CONFIG)).toBeNull();
  });

  it("funds a pool that opened while the fund was empty, once money arrives", async () => {
    // A pool is created when its round finalizes, which may be before the fund can
    // cover it. Money arriving later has to reach it, or it stays dead forever.
    expect(await openPoolLiquidity(prisma, MARKET, null, CONFIG)).toBeNull();
    expect(await fundPendingPools(prisma)).toEqual([]);

    await seedFund(prisma, 1_000n * USD, "late-seed");
    expect(await fundPendingPools(prisma)).toEqual([MARKET]);
    expect(await poolBook(prisma, MARKET, "YES", CONFIG)).not.toBeNull();

    // Already funded: a later tick does nothing.
    expect(await fundPendingPools(prisma)).toEqual([]);
    expect(await prisma.poolLiquidity.count()).toBe(1);
  });

  it("never funds a resolved pool", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await prisma.market.update({
      where: { id: MARKET },
      data: { status: "resolved", resolvedOutcome: "YES", resolvedAt: new Date(), payoutsAuthorizedAt: new Date() },
    });
    expect(await fundPendingPools(prisma)).toEqual([]);
  });

  it("derives inventory from filled positions, net of both sides", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await openPoolLiquidity(prisma, MARKET, null, CONFIG);

    await filledPosition("YES", 40n * USD, 20n * USD, 1);
    await filledPosition("YES", 10n * USD, 5n * USD, 2);
    await filledPosition("NO", 15n * USD, 7n * USD, 3);

    expect(await poolInventory(prisma, MARKET)).toEqual({
      qYesMicros: 50n * USD,
      qNoMicros: 15n * USD,
    });

    // The book reflects that inventory: YES has been bought, so it costs more.
    const yes = await poolBook(prisma, MARKET, "YES", CONFIG);
    const no = await poolBook(prisma, MARKET, "NO", CONFIG);
    expect(Number(yes!.lastTradePrice)).toBeGreaterThan(0.5);
    expect(Number(no!.lastTradePrice)).toBeLessThan(0.5);
    // Both sides quote a real ladder.
    expect(yes!.asks.length).toBeGreaterThan(0);
    expect(yes!.bids.length).toBeGreaterThan(0);
  });

  it("is reachable through every lookup a client uses", async () => {
    // Four separate places resolve a market by id, and each one has missed pools at
    // some point: resolveMarket, the contract page, GET /api/markets/[id] and the
    // book endpoint. They all funnel through getPoolMarket / poolBook, so assert
    // both answer for a real pool.
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await openPoolLiquidity(prisma, MARKET, null, CONFIG);

    const market = await getPoolMarket(MARKET, prisma);
    expect(market).not.toBeNull();
    expect(market!.source).toBe("veyra");
    expect(market!.seats.map((s) => s.side)).toEqual(["lands", "misses"]);

    for (const outcome of ["YES", "NO"] as const) {
      const book = await poolBook(prisma, MARKET, outcome, CONFIG);
      expect(book!.asks.length).toBeGreaterThan(0);
      // "pool", not "synthetic": a demo book is fiction and must not trade live,
      // while a pool book is the LMSR curve the fund stands behind.
      expect(book!.source).toBe("pool");
    }

    // An unknown id resolves to nothing rather than inventing a market.
    expect(await getPoolMarket("veyra-nope", prisma)).toBeNull();
    expect(await poolBook(prisma, "veyra-nope", "YES", CONFIG)).toBeNull();
  });

  it("takes the fee from reputation's PnL and books the pool's mirror result", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    const pool = await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    const predictions = [
      await filledPosition("YES", 40n * USD, 20n * USD, 1),
      await filledPosition("YES", 20n * USD, 10n * USD, 2),
      await filledPosition("NO", 12n * USD, 6n * USD, 3),
    ];

    // Market resolved and scored: two winners, one loser.
    await prisma.market.update({
      where: { id: MARKET },
      data: { status: "resolved", resolvedOutcome: "YES", resolvedAt: new Date(), payoutsAuthorizedAt: new Date() },
    });
    await prisma.reputationJob.create({
      data: { marketId: MARKET, resolvedOutcome: "YES", status: "DONE" },
    });
    const score = async (who: number, pnl: bigint, predictionId: string) => {
      await prisma.userReputation.upsert({
        where: { walletAddress: wallet(who) },
        create: { walletAddress: wallet(who) },
        update: {},
      });
      await prisma.predictionScore.create({
        data: {
          predictionId,
          walletAddress: wallet(who),
          marketId: MARKET,
          category: "crypto",
          predictedOutcome: "YES",
          resolvedOutcome: "YES",
          confidenceBps: 7000,
          impliedYesBps: 5000,
          correct: pnl > 0n,
          brierMicros: 90_000n,
          notionalMicros: 20n * USD,
          payoutMicros: 40n * USD,
          pnlMicros: pnl,
          resolvedAt: new Date(),
        },
      });
    };
    await score(1, 20n * USD, predictions[0]!.id); // winner
    await score(2, 10n * USD, predictions[1]!.id); // winner
    await score(3, -6n * USD, predictions[2]!.id); // loser

    const settled = await settleResolvedPools(prisma);
    expect(settled).toHaveLength(1);
    // Fee is 2% of winners' profit only: 2% of 30 USDC.
    expect(settled[0]!.feeMicros).toBe((30n * USD * 200n) / 10_000n);
    // The pool is the only counterparty, so its result mirrors the traders'.
    expect(settled[0]!.traderPnlMicros).toBe(24n * USD);
    expect(settled[0]!.poolRealisedMicros).toBe(-24n * USD);

    const closed = await prisma.poolLiquidity.findUniqueOrThrow({ where: { marketId: MARKET } });
    expect(closed.status).toBe("CLOSED");

    // Fund: seed - pool loss + fee, and the reservation is released.
    const balances = await fundBalances(prisma);
    expect(balances.totalMicros).toBe(1_000n * USD - 24n * USD + (30n * USD * 200n) / 10_000n);
    expect(balances.allocatedMicros).toBe(0n);
    expect(balances.reserveMicros).toBe(balances.totalMicros);
    void pool;
  });

  it("settles a pool exactly once, even with several workers", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    await prisma.market.update({
      where: { id: MARKET },
      data: { status: "resolved", resolvedOutcome: "NO", resolvedAt: new Date(), payoutsAuthorizedAt: new Date() },
    });
    await prisma.reputationJob.create({
      data: { marketId: MARKET, resolvedOutcome: "NO", status: "DONE" },
    });

    const runs = await Promise.all([
      settleResolvedPools(prisma),
      settleResolvedPools(prisma),
      settleResolvedPools(prisma),
    ]);
    expect(runs.flat()).toHaveLength(1);
    expect(await prisma.liquidityFundEntry.count({ where: { kind: "FEE" } })).toBeLessThanOrEqual(1);
    expect(await settleResolvedPools(prisma)).toEqual([]);
  });

  it("does not settle before scoring has finished", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    await prisma.market.update({
      where: { id: MARKET },
      data: { status: "resolved", resolvedOutcome: "YES", resolvedAt: new Date(), payoutsAuthorizedAt: new Date() },
    });
    // Job still queued: taking a fee now would use a partial set of positions.
    await prisma.reputationJob.create({
      data: { marketId: MARKET, resolvedOutcome: "YES", status: "QUEUED" },
    });
    expect(await settleResolvedPools(prisma)).toEqual([]);

    // Unresolved markets are never settled either.
    await prisma.reputationJob.deleteMany();
    await prisma.market.update({
      where: { id: MARKET },
      data: { status: "open", resolvedAt: null, resolvedOutcome: null },
    });
    expect(await settleResolvedPools(prisma)).toEqual([]);
    expect(
      (await prisma.poolLiquidity.findUniqueOrThrow({ where: { marketId: MARKET } })).status,
    ).toBe("ACTIVE");
  });

  it("never books a closed pool's result twice", async () => {
    await seedFund(prisma, 1_000n * USD, "seed-1");
    await openPoolLiquidity(prisma, MARKET, null, CONFIG);
    expect(await closePoolLiquidity(prisma, MARKET, -5n * USD, 1n * USD)).toEqual({ closed: true });
    expect(await closePoolLiquidity(prisma, MARKET, -5n * USD, 1n * USD)).toEqual({ closed: false });
    const balances = await fundBalances(prisma);
    expect(balances.totalMicros).toBe(1_000n * USD - 5n * USD + 1n * USD);
  });
});
