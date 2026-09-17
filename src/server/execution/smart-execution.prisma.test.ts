import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OrderBookSnapshot } from "@/lib/betting";
import { defaultExecutionEngineConfig } from "@/server/execution/config";
import { ExecutionEngine } from "@/server/execution/engine";
import { prismaExecutionStore } from "@/server/execution/store";
import type { ExecutionIntentInput } from "@/server/execution/types";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";

/**
 * Multi-worker behaviour on a real migrated SQLite database. Each ExecutionEngine
 * instance has its own in-process lock, so two instances model two worker processes;
 * only the database claims/leases stand between them.
 */

let dir: string;
let prisma: PrismaClient;
let seq = 0;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "veyra-exec-"));
  const url = `file:${path.join(dir, "exec.db")}`;
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

beforeEach(async () => {
  await prisma.executionSlice.deleteMany();
  await prisma.executionIntent.deleteMany();
  await prisma.executionBatch.deleteMany();
  await prisma.fill.deleteMany();
  await prisma.confidenceHistory.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.position.deleteMany();
  await prisma.prediction.deleteMany();
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
  hash: "h",
});

/** Real Position/Execution rows so ExecutionIntent's foreign key is satisfied. */
async function intentRow(side: "BUY" | "SELL", shares: bigint, key?: string): Promise<ExecutionIntentInput> {
  seq += 1;
  await prisma.market.upsert({
    where: { id: "m" },
    create: { id: "m", title: "t", category: "crypto", tag: "t", status: "open", source: "polymarket" },
    update: {},
  });
  const prediction = await prisma.prediction.create({
    data: {
      walletAddress: `0x${seq.toString().padStart(40, "0")}`,
      marketId: "m",
      outcome: "YES",
      confidenceBps: 7000,
      stakeMicros: 1_000_000n,
      marketPriceBps: 5000,
      engineVersion: "v1",
      engineInputJson: "{}",
      engineOutputJson: "{}",
      status: "accepted",
      position: {
        create: {
          marketId: "m",
          walletAddress: `0x${seq.toString().padStart(40, "0")}`,
          outcome: "YES",
          side,
          tokenId: "tok",
          sharesMicros: 0n,
          limitPriceBps: 5500,
          avgPriceBps: 0,
          notionalMicros: 0n,
          payoutMicros: 0n,
          edgeBps: 0,
          kellyBps: 0,
          status: "pending",
          executions: {
            create: {
              venue: "polymarket",
              mode: "live",
              status: "created",
              tokenId: "tok",
              side,
              orderType: "FAK",
              limitPriceBps: 5500,
              sizeSharesMicros: shares,
              notionalMicros: shares / 2n,
              requestJson: "{}",
            },
          },
        },
      },
    },
    include: { position: { include: { executions: true } } },
  });
  return {
    executionId: prediction.position!.executions[0]!.id,
    positionId: prediction.position!.id,
    marketId: "m",
    outcome: "YES",
    tokenId: "tok",
    side,
    sharesMicros: shares,
    notionalMicros: shares / 2n,
    limitPriceBps: side === "BUY" ? 5500 : 4500,
    orderType: "FAK",
    tickSize: "0.01",
    negRisk: false,
    quotedPriceBps: 5000,
    idempotencyKey: key,
  };
}

function venue(options: { delayMs?: number; result?: (r: VenueOrderRequest) => VenueOrderResult; getOrder?: () => Promise<VenueOrderResult | null> } = {}) {
  const requests: VenueOrderRequest[] = [];
  const client = createPolymarketClient({
    mode: "live",
    getBook: async () => book(),
    submitOrder: async (request) => {
      requests.push(request);
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      return (
        options.result?.(request) ?? {
          mode: "live",
          status: "filled",
          polymarketOrderId: `o${requests.length}`,
          response: {},
          fills: [
            {
              priceBps: 5000,
              sharesMicros: request.sharesMicros,
              notionalMicros: request.sharesMicros / 2n,
              feeMicros: 0n,
              venueTradeId: `t${requests.length}`,
              simulated: false,
            },
          ],
          errorMessage: null,
        }
      );
    },
    getOrder: options.getOrder,
  });
  return { client, requests };
}

const worker = (client: ReturnType<typeof venue>["client"]) =>
  new ExecutionEngine(client, prismaExecutionStore(prisma), defaultExecutionEngineConfig);

describe("Smart Execution across concurrent workers (Prisma)", () => {
  it("two workers draining the same token never send an intent twice", async () => {
    const shared = venue({ delayMs: 15 });
    const inputs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => intentRow("BUY", 2_000_000n)));
    const a = worker(shared.client);
    const b = worker(shared.client);
    for (const input of inputs) await a.enqueue(input);

    const results = await Promise.all([a.processAll(), b.processAll(), a.processAll(), b.processAll()]);
    const sent = shared.requests.reduce((total, r) => total + r.sharesMicros, 0n);
    expect(sent).toBe(12_000_000n);
    // Calls on the same engine share one in-flight run, so dedupe results by batch.
    const batches = new Map(results.flat().map((result) => [result.batch.id, result]));
    const allocated = [...batches.values()].flatMap((result) => result.allocations);
    expect(new Set(allocated.map((row) => row.intentId)).size).toBe(6);
    expect(allocated).toHaveLength(6);
    const rows = await prisma.executionIntent.findMany();
    expect(rows.every((row) => row.status === "RECONCILED" && row.executedSharesMicros === 2_000_000n)).toBe(true);
  });

  it("concurrent enqueues of the same execution return one intent", async () => {
    const input = await intentRow("BUY", 2_000_000n, "same-key-0001");
    const engine = worker(venue().client);
    const [x, y, z] = await Promise.all([engine.enqueue(input), worker(venue().client).enqueue(input), engine.enqueue(input)]);
    expect(new Set([x.id, y.id, z.id]).size).toBe(1);
    expect(await prisma.executionIntent.count()).toBe(1);
  });

  it("two reconcilers of the same resting order allocate its fills exactly once", async () => {
    let terminal: VenueOrderResult | null = null;
    const resting = venue({
      result: () => ({ mode: "live", status: "open", polymarketOrderId: "rest-1", response: {}, fills: [], errorMessage: null }),
      getOrder: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return terminal;
      },
    });
    const input = await intentRow("BUY", 4_000_000n);
    const processed = await worker(resting.client).enqueueAndProcess(input);
    expect(processed.allocation?.status).toBe("pending");

    terminal = {
      mode: "live",
      status: "filled",
      polymarketOrderId: "rest-1",
      response: {},
      fills: [{ priceBps: 5000, sharesMicros: 4_000_000n, notionalMicros: 2_000_000n, feeMicros: 0n, venueTradeId: "rt-1", simulated: false }],
      errorMessage: null,
    };
    const [first, second] = await Promise.all([
      worker(resting.client).reconcileBatch(processed.batch!.id),
      worker(resting.client).reconcileBatch(processed.batch!.id),
    ]);
    const winners = [first, second].filter(Boolean);
    expect(winners).toHaveLength(1);
    const intentAfter = await prisma.executionIntent.findUniqueOrThrow({ where: { id: processed.intent.id } });
    expect(intentAfter.executedSharesMicros).toBe(4_000_000n);
    expect(intentAfter.status).toBe("RECONCILED");
    // Later passes see a finished batch.
    expect(await worker(resting.client).reconcileBatch(processed.batch!.id)).toBeNull();
    const batch = await prisma.executionBatch.findUniqueOrThrow({ where: { id: processed.batch!.id } });
    expect(batch.executedSharesMicros).toBe(4_000_000n);
    expect(batch.reconcileToken).toBeNull();
  });

  it("crash recovery leaves a live run alone and only fails intents of dead runs", async () => {
    let observer: ExecutionEngine;
    let recoveredDuringRun: Awaited<ReturnType<ExecutionEngine["recoverStuck"]>> | undefined;
    const live = createPolymarketClient({
      mode: "live",
      getBook: async () => book(),
      submitOrder: async (request) => {
        // Negative lease: every claim looks expired, but the run's batch lease is held and renewed.
        recoveredDuringRun = await observer.recoverStuck(-1_000);
        return {
          mode: "live",
          status: "filled",
          polymarketOrderId: "live-1",
          response: {},
          fills: [{ priceBps: 5000, sharesMicros: request.sharesMicros, notionalMicros: request.sharesMicros / 2n, feeMicros: 0n, venueTradeId: "lt-1", simulated: false }],
          errorMessage: null,
        };
      },
    });
    observer = worker(live);
    const processed = await worker(live).enqueueAndProcess(await intentRow("BUY", 2_000_000n));
    expect(recoveredDuringRun?.allocations).toEqual([]);
    expect(processed.allocation).toMatchObject({ status: "filled", executedSharesMicros: 2_000_000n });
    expect((await prisma.executionIntent.findUniqueOrThrow({ where: { id: processed.intent.id } })).status).toBe("RECONCILED");

    // A genuinely dead run (claimed, no batch lease) is failed without touching the venue.
    const dead = await intentRow("BUY", 1_000_000n);
    const deadEngine = worker(live);
    await deadEngine.enqueue(dead);
    await prismaExecutionStore(prisma).claimQueued("tok");
    const recovered = await deadEngine.recoverStuck(-1_000);
    expect(recovered.allocations).toMatchObject([{ executionId: dead.executionId, status: "failed", errorCode: "WORKER_ABORTED" }]);
  });
});
