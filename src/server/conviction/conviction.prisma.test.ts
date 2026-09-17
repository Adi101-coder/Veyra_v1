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
  placePrediction,
  reconcileExecutions,
  type BettingDeps,
} from "@/server/betting/service";
import { defaultConvictionEngineConfig } from "@/server/conviction/config";
import { ConvictionEngine } from "@/server/conviction/engine";
import { computeConviction } from "@/server/conviction/formula";
import { prismaConvictionStore } from "@/server/conviction/store";
import type { PolymarketReference } from "@/server/conviction/types";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";

/**
 * Conviction from real filled positions on a migrated SQLite database. Every
 * measurement is also recomputed independently from the Fill table, so the store's
 * filters and the ledger must agree with first principles.
 */

let dir: string;
let prisma: PrismaClient;
let seq = 0;
const MID: PolymarketReference = { probabilityBps: 5000, source: "clob_midpoint" };

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "veyra-conv-"));
  const url = `file:${path.join(dir, "conv.db")}`;
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
  tokenId: "tok",
  asks: [{ price: "0.50", size: "100000" }],
  bids: [{ price: "0.49", size: "100000" }],
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "polymarket",
  timestamp: String(Date.now()),
  hash: "book",
});

let tradeSeq = 0;
function fill(request: VenueOrderRequest, fraction = 1): VenueOrderResult {
  tradeSeq += 1;
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 100))) / 100n;
  const price = request.side === "BUY" ? 5000 : 4900;
  return {
    mode: "live",
    status: fraction >= 1 ? "filled" : shares > 0n ? "partial" : "rejected",
    polymarketOrderId: `o-${tradeSeq}`,
    response: {},
    fills: shares > 0n ? [{ priceBps: price, sharesMicros: shares, notionalMicros: (shares * BigInt(price)) / 10_000n, feeMicros: 0n, venueTradeId: `t-${tradeSeq}`, simulated: false }] : [],
    errorMessage: shares > 0n ? null : "no fill",
  };
}

function world() {
  seq += 1;
  const marketId = `conv-${seq}`;
  const market: Market = { ...coreMarkets[0]!, id: marketId, source: "polymarket", status: "open", openSeats: 1, clobTokenIds: ["tok-yes", "tok-no"] };
  const venue = { script: (r: VenueOrderRequest): VenueOrderResult => fill(r), orders: new Map<string, VenueOrderResult>(), resolved: false };
  const deps = (): BettingDeps =>
    createPrismaDeps(prisma, {
      client: createPolymarketClient({
        mode: "live",
        getBook: async () => book(),
        submitOrder: async (request) => venue.script(request),
        getOrder: async (id) => venue.orders.get(id) ?? null,
      }),
      getCatalogMarket: () => null,
      getLiveMarket: async (id) => (id === marketId ? market : null),
      getResolution: async () => (venue.resolved ? { resolved: true, outcome: "NO" } : { resolved: false }),
    });
  let keySeq = 0;
  const key = () => `${marketId}-${(keySeq += 1).toString().padStart(6, "0")}`;
  let walletSeq = 0;
  const wallet = () => `0x${seq.toString(16).padStart(8, "0")}${(walletSeq += 1).toString(16).padStart(32, "0")}`;
  const bet = (walletAddress: string, outcome: "YES" | "NO", confidencePct: number) =>
    placePrediction({ marketId, outcome, confidencePct, stakeUsd: "100.00", walletAddress, idempotencyKey: key() }, deps());
  const engine = () => new ConvictionEngine(defaultConvictionEngineConfig, prismaConvictionStore(prisma));
  return { marketId, venue, deps, key, wallet, bet, engine };
}

/** First-principles recomputation: positions rebuilt from Fill rows, not Position columns. */
async function recomputeFromFills(marketId: string, polymarket: PolymarketReference) {
  const predictions = await prisma.prediction.findMany({
    where: { marketId },
    include: { position: { include: { executions: { include: { fills: true } } } } },
  });
  const positions = predictions.flatMap((prediction) => {
    let shares = 0n;
    let cost = 0n;
    let avg = 0n;
    for (const execution of [...(prediction.position?.executions ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      for (const f of execution.fills) {
        if (execution.side === "SELL") {
          shares -= f.sharesMicros;
          cost = (shares * avg) / 10_000n;
        } else {
          shares += f.sharesMicros;
          cost += f.notionalMicros;
          avg = shares > 0n ? (cost * 10_000n) / shares : 0n;
        }
      }
    }
    if (shares <= 0n) return [];
    return [{ predictionId: prediction.id, walletAddress: prediction.walletAddress, outcome: prediction.outcome as "YES" | "NO", confidenceBps: prediction.confidenceBps, sharesMicros: shares, capitalMicros: cost, status: prediction.position!.status }];
  });
  return computeConviction({ marketId, positions, polymarket, capitalBlendBps: defaultConvictionEngineConfig.capitalBlendBps, binCount: defaultConvictionEngineConfig.binCount });
}

async function expectMatchesFills(marketId: string, dto: Awaited<ReturnType<ConvictionEngine["measure"]>>, polymarket = MID) {
  const expected = await recomputeFromFills(marketId, polymarket);
  expect(dto.participants).toBe(expected.participants);
  expect(dto.capitalMicros).toBe(expected.capitalMicros.toString());
  expect(dto.averageConfidenceBps).toBe(expected.averageConfidenceBps);
  expect(dto.capitalWeightedConfidenceBps).toBe(expected.capitalWeightedConfidenceBps);
  expect(dto.convictionBps).toBe(expected.convictionBps);
}

describe("Veyra Conviction on real filled positions (Prisma)", () => {
  it("an empty market reports zero participants and null conviction", async () => {
    const w = world();
    const dto = await w.engine().measure(w.marketId, MID);
    expect(dto).toMatchObject({ participants: 0, totalCapitalUsd: "0.00", conviction: null, averageConfidence: null, divergence: null, polymarketProbability: 50 });
    expect(await prisma.convictionSnapshot.count({ where: { marketId: w.marketId } })).toBe(0);
  });

  it("excludes pending, failed and flattened positions; partial fills count only filled capital", async () => {
    const w = world();
    await w.bet(w.wallet(), "YES", 80); // full fill
    w.venue.script = (r) => fill(r, 0.25);
    const partial = await w.bet(w.wallet(), "YES", 90); // 25% filled
    w.venue.script = () => ({ mode: "live", status: "rejected", polymarketOrderId: null, response: {}, fills: [], errorMessage: "rejected" });
    const failed = await w.bet(w.wallet(), "NO", 95);
    w.venue.script = () => ({ mode: "live", status: "open", polymarketOrderId: "rest-1", response: {}, fills: [], errorMessage: null });
    const pending = await w.bet(w.wallet(), "NO", 95);
    w.venue.script = (r) => fill(r);
    const flattenWallet = w.wallet();
    const flattened = await w.bet(flattenWallet, "YES", 70);
    await changeConfidence(flattened.id, { confidencePct: 40, walletAddress: flattenWallet, idempotencyKey: w.key() }, w.deps());
    expect([failed.position?.status, pending.position?.status]).toEqual(["failed", "pending"]);
    expect((await prisma.position.findFirstOrThrow({ where: { predictionId: flattened.id } })).status).toBe("closed");

    const dto = await w.engine().measure(w.marketId, MID);
    expect(dto.participants).toBe(2);
    const partialPosition = await prisma.position.findFirstOrThrow({ where: { predictionId: partial.id }, include: { executions: true } });
    const ordered = partialPosition.executions[0]!.sizeSharesMicros;
    expect(partialPosition.sharesMicros).toBe((ordered * 25n) / 100n);
    const fullCapital = (await prisma.position.findMany({ where: { marketId: w.marketId, status: "filled" } })).reduce((sum, row) => sum + row.notionalMicros, 0n);
    // YES capital = the full fill + only the filled quarter of the partial order.
    expect(dto.outcomes.YES.capitalMicros).toBe((fullCapital + partialPosition.notionalMicros).toString());
    expect(partialPosition.notionalMicros).toBe((partialPosition.sharesMicros * 5000n) / 10_000n);
    expect(dto.outcomes.NO.participants).toBe(0);
    await expectMatchesFills(w.marketId, dto);
  });

  it("a wallet holding YES and NO counts once, with capital on each side", async () => {
    const w = world();
    const hedger = w.wallet();
    await w.bet(hedger, "YES", 80);
    await w.bet(hedger, "NO", 70);
    await w.bet(w.wallet(), "YES", 60);
    const dto = await w.engine().measure(w.marketId, MID);
    expect(dto.participants).toBe(2);
    expect(dto.outcomes.YES.participants).toBe(2);
    expect(dto.outcomes.NO.participants).toBe(1);
    expect(BigInt(dto.outcomes.YES.capitalMicros) + BigInt(dto.outcomes.NO.capitalMicros)).toBe(BigInt(dto.capitalMicros));
    await expectMatchesFills(w.marketId, dto);
  });

  it("stays consistent while fills are reconciled and confidence changes concurrently", async () => {
    const w = world();
    const wallets = [w.wallet(), w.wallet(), w.wallet()];
    for (const wallet of wallets) await w.bet(wallet, "YES", 75);
    w.venue.script = () => ({ mode: "live", status: "open", polymarketOrderId: `rest-${seq}`, response: {}, fills: [], errorMessage: null });
    const resting = await w.bet(w.wallet(), "NO", 85);
    const execution = await prisma.execution.findFirstOrThrow({ where: { position: { predictionId: resting.id } } });
    w.venue.orders.set(`rest-${seq}`, { ...fill({ side: "BUY", sharesMicros: execution.sizeSharesMicros } as VenueOrderRequest), polymarketOrderId: `rest-${seq}` });
    w.venue.script = (r) => fill(r);

    const measurements = await Promise.all([
      w.engine().measure(w.marketId, MID),
      reconcileExecutions(w.deps()),
      w.engine().measure(w.marketId, MID),
      changeConfidence((await prisma.prediction.findFirstOrThrow({ where: { marketId: w.marketId, walletAddress: wallets[0]! } })).id, { confidencePct: 90, walletAddress: wallets[0]!, idempotencyKey: w.key() }, w.deps()),
      w.engine().measure(w.marketId, MID),
    ]);
    // Every concurrent measurement is one of the valid states: never a mix of half-applied rows.
    for (const dto of [measurements[0], measurements[2], measurements[4]] as Awaited<ReturnType<ConvictionEngine["measure"]>>[]) {
      expect([3, 4]).toContain(dto.participants);
      expect(BigInt(dto.outcomes.YES.capitalMicros) + BigInt(dto.outcomes.NO.capitalMicros)).toBe(BigInt(dto.capitalMicros));
    }
    const settled = await w.engine().measure(w.marketId, MID);
    expect(settled.participants).toBe(4);
    await expectMatchesFills(w.marketId, settled);
    // Concurrent measurements in one bucket persisted exactly one snapshot.
    expect(await prisma.convictionSnapshot.count({ where: { marketId: w.marketId } })).toBe(1);
  });

  it("after resolution, conviction is computed from final fills against the resolved price", async () => {
    const w = world();
    await w.bet(w.wallet(), "YES", 80);
    await w.bet(w.wallet(), "NO", 60);
    w.venue.resolved = true;
    await enqueueMarketResolution(w.marketId, undefined, w.deps());
    const dto = await w.engine().measure(w.marketId, MID);
    expect(dto).toMatchObject({ polymarketSource: "resolved", polymarketProbabilityBps: 0, resolution: { outcome: "NO" } });
    expect(dto.divergenceBps).toBe(dto.convictionBps);
    await expectMatchesFills(w.marketId, dto, { probabilityBps: 0, source: "resolved" });
    await reconcileExecutions(w.deps());
    const again = await w.engine().measure(w.marketId, MID);
    expect(again.inputsHash).toBe(dto.inputsHash); // nothing changes after resolution
  });
});
