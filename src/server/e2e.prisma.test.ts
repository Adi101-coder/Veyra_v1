import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import type { OrderBookSnapshot } from "@/lib/betting";
import { coreMarkets, type Market } from "@/lib/markets";
import {
  changeConfidence,
  createPrismaDeps,
  enqueueMarketResolution,
  getPrediction,
  getUserReputation,
  listUserPredictions,
  placePrediction,
  processReputationJobs,
  reconcileExecutions,
  syncExecution,
  type BettingDeps,
} from "@/server/betting/service";
import { ConvictionEngine } from "@/server/conviction/engine";
import { defaultConvictionEngineConfig } from "@/server/conviction/config";
import { prismaConvictionStore } from "@/server/conviction/store";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";
import type { VenueResolution } from "@/server/polymarket/gamma";
import { createRobinhoodClients } from "@/server/chain/client";
import { loadRobinhoodChainConfig } from "@/server/chain/config";
import { runSettlementTick } from "@/server/chain/settlement";
import { createSimulatedChain } from "@/server/chain/testing/simulated-chain";

/**
 * Full flow against a freshly migrated PostgreSQL schema with a scripted Polymarket:
 * market -> confidence bet -> accepted (resting) order -> reconcile real fill ->
 * change confidence (fill / reject) -> resolution -> reputation -> conviction.
 */

const ALICE = "0xa11ce00000000000000000000000000000000001";
const BOB = "0xb0b0000000000000000000000000000000000002";

const market: Market = {
  ...coreMarkets[0]!,
  id: "e2e-venue-market",
  source: "polymarket",
  status: "open",
  openSeats: 1,
  clobTokenIds: ["tok-yes", "tok-no"],
};

function book(): OrderBookSnapshot {
  return {
    tokenId: "tok-yes",
    asks: [{ price: "0.50", size: "100000" }],
    bids: [{ price: "0.49", size: "100000" }],
    minOrderSize: "1",
    tickSize: "0.01",
    negRisk: false,
    source: "polymarket",
    timestamp: String(Date.now()),
    hash: "book",
  };
}

type Script = (request: VenueOrderRequest, n: number) => VenueOrderResult;

function venueFill(request: VenueOrderRequest, id: string, fraction = 1): VenueOrderResult {
  const shares = (request.sharesMicros * BigInt(Math.round(fraction * 100))) / 100n;
  const price = request.side === "BUY" ? 5000 : 4900;
  return {
    mode: "live",
    status: fraction >= 1 ? "filled" : "partial",
    polymarketOrderId: id,
    response: { orderID: id, status: "matched" },
    fills: [
      {
        priceBps: price,
        sharesMicros: shares,
        notionalMicros: (shares * BigInt(price)) / 10_000n,
        feeMicros: 0n,
        venueTradeId: `trade-${id}`,
        simulated: false,
      },
    ],
    errorMessage: null,
  };
}

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;
let script: Script;
let submits = 0;
const venueOrders = new Map<string, VenueOrderResult>();
let resolution: VenueResolution = { resolved: false };
let deps: BettingDeps;

function freshDeps() {
  const client = createPolymarketClient({
    mode: "live",
    getBook: async () => book(),
    submitOrder: async (request) => {
      submits += 1;
      return script(request, submits);
    },
    getOrder: async (orderId) => venueOrders.get(orderId) ?? null,
  });
  return createPrismaDeps(prisma, {
    client,
    getCatalogMarket: () => null,
    getLiveMarket: async (id) => (id === market.id ? market : null),
    getResolution: async () => resolution,
  });
}

beforeAll(() => {
  database = createTestDatabase("e2e");
  prisma = database.prisma;
  deps = freshDeps();
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

describe("Veyra end-to-end (Prisma + mocked Polymarket)", () => {
  let predictionId = "";
  let openingExecutionId = "";
  let heldAfterFill = 0n;

  it("an accepted-but-resting order creates no position until the venue reports a fill", async () => {
    script = () => ({
      mode: "live",
      status: "open",
      polymarketOrderId: "order-open-1",
      response: { orderID: "order-open-1", status: "live" },
      fills: [],
      errorMessage: null,
    });
    const placed = await placePrediction(
      { marketId: market.id, outcome: "YES", confidencePct: 80, stakeUsd: "100.00", walletAddress: ALICE, idempotencyKey: "alice-place-0001" },
      deps,
    );
    predictionId = placed.id;
    openingExecutionId = placed.execution!.id;
    expect(submits).toBe(1);
    expect(placed.execution?.status).toBe("submitted");
    expect(placed.position?.status).toBe("pending");
    expect(placed.position?.shares).toBe("0.00");

    const conviction = await new ConvictionEngine(defaultConvictionEngineConfig, prismaConvictionStore(prisma)).measure(
      market.id,
      { probabilityBps: 5000, source: "clob_midpoint" },
      { persist: "never" },
    );
    expect(conviction.participants).toBe(0);
  });

  it("replays duplicate and concurrent submissions without a second order", async () => {
    const input = { marketId: market.id, outcome: "YES" as const, confidencePct: 80, stakeUsd: "100.00", walletAddress: ALICE, idempotencyKey: "alice-place-0001" };
    const [a, b] = await Promise.all([placePrediction(input, deps), placePrediction(input, deps)]);
    expect(a.id).toBe(predictionId);
    expect(b.id).toBe(predictionId);
    expect(submits).toBe(1);
    expect(await prisma.prediction.count()).toBe(1);
  });

  it("reconciles the venue fill exactly once", async () => {
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: openingExecutionId } });
    venueOrders.set(
      "order-open-1",
      venueFill({ side: "BUY", sharesMicros: execution.sizeSharesMicros } as VenueOrderRequest, "order-open-1"),
    );
    const synced = await syncExecution(openingExecutionId, deps);
    // syncExecution throws when the execution is missing, so a null here would be a
    // contract change rather than a normal outcome.
    expect(synced).not.toBeNull();
    expect(synced!.position?.status).toBe("filled");
    expect(synced!.execution?.status).toBe("filled");
    await syncExecution(openingExecutionId, deps);
    await reconcileExecutions(deps);
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId } });
    expect(position.sharesMicros).toBe(execution.sizeSharesMicros);
    expect(position.notionalMicros).toBe((execution.sizeSharesMicros * 5000n) / 10_000n);
    expect(await prisma.fill.count({ where: { executionId: openingExecutionId } })).toBe(1);
    heldAfterFill = position.sharesMicros;
  });

  it("80% -> 60% records history and sells only what filled", async () => {
    script = (request, n) => venueFill(request, `order-adjust-${n}`);
    const { prediction, history } = await changeConfidence(
      predictionId,
      { confidencePct: 60, walletAddress: ALICE, idempotencyKey: "alice-adjust-0001" },
      deps,
    );
    expect(history.status).toBe("filled");
    expect(prediction.confidencePct).toBe(60);
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId } });
    expect(position.sharesMicros).toBeLessThan(heldAfterFill);
    expect(await prisma.confidenceHistory.count({ where: { predictionId } })).toBe(1);
    heldAfterFill = position.sharesMicros;
  });

  it("a rejected adjustment leaves position and confidence untouched", async () => {
    script = () => ({
      mode: "live",
      status: "rejected",
      polymarketOrderId: null,
      response: { error: "not enough balance" },
      fills: [],
      errorMessage: "not enough balance",
    });
    const { prediction, history } = await changeConfidence(
      predictionId,
      { confidencePct: 90, walletAddress: ALICE, idempotencyKey: "alice-adjust-0002" },
      deps,
    );
    expect(history.status).toBe("failed");
    expect(prediction.confidencePct).toBe(60);
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId } });
    expect(position.sharesMicros).toBe(heldAfterFill);
    expect(position.status).toBe("filled");
  });

  it("rejects another wallet adjusting the position", async () => {
    await expect(
      changeConfidence(predictionId, { confidencePct: 70, walletAddress: BOB, idempotencyKey: "bob-adjust-00001" }, deps),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a failed order is never scored and never counts toward conviction", async () => {
    script = () => ({
      mode: "live",
      status: "rejected",
      polymarketOrderId: null,
      response: {},
      fills: [],
      errorMessage: "rejected",
    });
    const placed = await placePrediction(
      { marketId: market.id, outcome: "NO", confidencePct: 90, stakeUsd: "50.00", walletAddress: BOB, idempotencyKey: "bob-place-00001" },
      deps,
    );
    expect(placed.position?.status).toBe("failed");
    const conviction = await new ConvictionEngine(defaultConvictionEngineConfig, prismaConvictionStore(prisma)).measure(
      market.id,
      { probabilityBps: 5000, source: "clob_midpoint" },
      { persist: "never" },
    );
    expect(conviction.participants).toBe(1);
  });

  it("refuses resolution before Polymarket resolves, then scores once and closes the market", async () => {
    await expect(enqueueMarketResolution(market.id, "YES", deps)).rejects.toMatchObject({ code: "NOT_RESOLVED" });
    resolution = { resolved: true, outcome: "YES" };
    await expect(enqueueMarketResolution(market.id, "NO", deps)).rejects.toMatchObject({ code: "RESOLUTION_MISMATCH" });
    await enqueueMarketResolution(market.id, undefined, deps);
    await processReputationJobs(deps);
    await enqueueMarketResolution(market.id, "YES", deps);
    await processReputationJobs(deps);

    const reputation = await getUserReputation(ALICE, deps);
    expect(reputation?.resolvedPredictions).toBe(1);
    expect(reputation?.correctPredictions).toBe(1);
    // Confidence 60% on YES, resolved YES: (0.6 - 1)^2 = 0.16
    expect(reputation?.brierScore).toBe("0.160000");
    expect(await prisma.predictionScore.count()).toBe(1);
    expect((await getUserReputation(BOB, deps))?.resolvedPredictions ?? 0).toBe(0);

    const rows = await listUserPredictions(ALICE, deps);
    expect(rows[0]?.resolution?.correct).toBe(true);
    expect(rows[0]?.score?.correct).toBe(true);
    expect(rows[0]?.score?.brierScore).toBe("0.160000");

    const wager = await getPrediction(predictionId, deps);
    expect(wager?.score).toMatchObject({
      resolvedOutcome: "YES",
      correct: true,
      brierScore: "0.160000",
      confidencePct: 60,
    });

    await expect(
      placePrediction(
        { marketId: market.id, outcome: "YES", confidencePct: 70, stakeUsd: "10.00", walletAddress: BOB, idempotencyKey: "bob-late-000001" },
        deps,
      ),
    ).rejects.toMatchObject({ code: "MARKET_RESOLVED" });
    await expect(
      changeConfidence(predictionId, { confidencePct: 75, walletAddress: ALICE, idempotencyKey: "alice-late-00001" }, deps),
    ).rejects.toMatchObject({ code: "MARKET_RESOLVED" });
  });

  it("links the scored prediction to a confirmed Robinhood Chain settlement transaction", async () => {
    const chain = createSimulatedChain({ chainId: 46630 });
    const settlementDeps = {
      prisma,
      clients: createRobinhoodClients(
        loadRobinhoodChainConfig({
          RH_SETTLEMENT_ENABLED: "true",
          RH_SETTLEMENT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        }),
        chain.transport,
      ),
    };
    const first = await runSettlementTick(settlementDeps);
    expect(first).toMatchObject({ enabled: true, enqueued: 1, submitted: 1 });

    let [dto] = (await listUserPredictions(ALICE, deps)).filter((row) => row.id === predictionId);
    expect(dto?.settlement).toMatchObject({ chainId: 46630, network: "testnet", status: "submitted" });

    chain.mine();
    await runSettlementTick(settlementDeps);
    [dto] = (await listUserPredictions(ALICE, deps)).filter((row) => row.id === predictionId);
    expect(dto?.settlement?.status).toBe("confirmed");
    expect(dto?.settlement?.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(dto?.settlement?.explorerUrl).toBe(`https://explorer.testnet.chain.robinhood.com/tx/${dto?.settlement?.txHash}`);

    // Only filled, scored predictions settle: BOB's failed order has no reference.
    expect(await prisma.chainSettlement.count()).toBe(1);
    const receipt = await createRobinhoodClients(settlementDeps.clients.config, chain.transport).publicClient.getTransactionReceipt({
      hash: dto!.settlement!.txHash as `0x${string}`,
    });
    expect(receipt.status).toBe("success");
  });
});
