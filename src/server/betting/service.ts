import "server-only";

import { getMarket, yesChance, type Market as CatalogMarket } from "@/lib/markets";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import type { EngineQuote, PlacePredictionRequest, QuoteRequest, ChangeConfidenceRequest, OrderBookSnapshot, Outcome } from "@/lib/betting";
import { ConfidenceEngine } from "@/server/confidence/engine";
import { loadConfidenceEngineConfig } from "@/server/confidence/config";
import { snapshotToEngineBook, syntheticBookFromMarket, tokenIdFor } from "@/server/confidence/book";
import {
  applyFilledDelta,
  isStalePrice,
  planAdjustment,
  targetPositionFromConfidence,
} from "@/server/confidence/adjust";
import type { EngineResult } from "@/server/confidence/types";
import { BettingError } from "@/server/errors";
import {
  confidencePctToBps,
  formatPrice,
  formatShares,
  formatUsd,
  parsePriceBps,
  parseUsdMicros,
  SHARE_SCALE,
} from "@/server/money";
import { getPrisma } from "@/server/db";
import { prismaBettingStore, type BettingStore, type ConfidenceHistoryRow } from "@/server/betting/repository";
import { toConfidenceHistoryDTO, toEngineQuote, toPredictionDTO } from "@/server/betting/mapper";
import { fetchClobBook } from "@/server/polymarket/clob";
import {
  createExecutor,
  type ExecutionRequest,
  type ExecutorPort,
} from "@/server/polymarket/executor";
import { clientFromExecutor, createPolymarketClient, type PolymarketClient } from "@/server/polymarket/client";
import { ExecutionEngine } from "@/server/execution/engine";
import { memoryExecutionStore, prismaExecutionStore, type ExecutionStore } from "@/server/execution/store";
import type { IntentAllocation, ProcessResult } from "@/server/execution/types";
import { ReputationEngine } from "@/server/reputation/engine";
import { memoryReputationStore, prismaReputationStore } from "@/server/reputation/store";
import type { Forecast, ForecastSource } from "@/server/reputation/types";
import { formatBrier } from "@/server/reputation/metrics";
import { parseOutcome } from "@/server/betting/validation";

function jsonSafe(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function walletsMatch(a: string, b: string) {
  if (a === b) return true;
  if (a.startsWith("0x") && b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return false;
}

function fillsFromAllocation(allocation: IntentAllocation) {
  return allocation.fills.map((fill) => ({
    venueTradeId: fill.venueTradeId,
    priceBps: fill.priceBps,
    sharesMicros: fill.sharesMicros,
    notionalMicros: fill.notionalMicros,
    feeMicros: fill.feeMicros,
    isSimulated: fill.simulated,
    rawJson: jsonSafe(fill),
  }));
}

async function applyForeignAllocations(
  deps: BettingDeps,
  result: ProcessResult | { allocations: IntentAllocation[]; batch?: ProcessResult["batch"] | null },
  skipExecutionId?: string | null,
) {
  const venueOrderId =
    result.batch?.slices.find((slice) => slice.polymarketOrderId)?.polymarketOrderId ?? null;
  for (const allocation of result.allocations) {
    if (skipExecutionId && allocation.executionId === skipExecutionId) continue;
    try {
      await deps.store.applyExecutionResult(allocation.executionId, {
        status:
          allocation.status === "filled" ? "filled" : allocation.status === "partial" ? "partial" : "failed",
        polymarketOrderId: venueOrderId,
        responseJson: jsonSafe({ batchId: result.batch?.id ?? null, engine: true }),
        errorMessage: allocation.errorMessage ?? null,
        submittedAt: new Date(),
        positionStatus:
          allocation.status === "filled" ? "filled" : allocation.status === "partial" ? "partial" : "failed",
        fills: fillsFromAllocation(allocation),
      });
    } catch {
      // Intent may belong to a different store in unit tests.
    }
  }
}

export type BettingDeps = {
  store: BettingStore;
  executor: ExecutorPort;
  getCatalogMarket: (id: string) => CatalogMarket | null;
  getLiveMarket: (id: string) => Promise<CatalogMarket | null>;
  getBook: (tokenId: string) => Promise<OrderBookSnapshot>;
  client?: PolymarketClient;
  executionStore?: ExecutionStore;
  engine?: ExecutionEngine;
  reputation?: ReputationEngine;
};

export function createDefaultDeps(): BettingDeps {
  const executor = createExecutor();
  const client = createPolymarketClient({ getBook: fetchClobBook });
  const executionStore = prismaExecutionStore(getPrisma());
  const prisma = getPrisma();
  const store = prismaBettingStore(prisma);
  return {
    store,
    executor,
    client,
    executionStore,
    engine: new ExecutionEngine(client, executionStore),
    reputation: new ReputationEngine(prismaReputationStore(prisma), bettingForecastSource(store)),
    getCatalogMarket: getMarket,
    getLiveMarket: fetchPolymarketMarket,
    getBook: (tokenId) => client.getBook(tokenId),
  };
}

function bettingForecastSource(store: BettingStore): ForecastSource {
  return {
    async listByMarket(marketId) {
      const rows = await store.listPredictions({ marketId, limit: 500 });
      return rows.map(bundleToForecast);
    },
  };
}

function bundleToForecast(bundle: import("@/server/betting/repository").PredictionBundle): Forecast {
  return {
    predictionId: bundle.id,
    walletAddress: bundle.walletAddress,
    marketId: bundle.marketId,
    category: bundle.market.category,
    predictedOutcome: bundle.outcome as Outcome,
    confidenceBps: bundle.confidenceBps,
    notionalMicros: bundle.position?.notionalMicros ?? 0n,
    payoutMicros: bundle.position?.payoutMicros ?? 0n,
  };
}

function getReputation(deps: BettingDeps) {
  if (!deps.reputation) {
    deps.reputation = new ReputationEngine(
      memoryReputationStore(),
      bettingForecastSource(deps.store),
    );
  }
  return deps.reputation;
}

function getEngine(deps: BettingDeps) {
  if (!deps.engine) {
    const client = deps.client ?? clientFromExecutor(deps.executor, deps.getBook);
    deps.client = client;
    deps.executionStore = deps.executionStore ?? memoryExecutionStore();
    deps.engine = new ExecutionEngine(client, deps.executionStore);
  }
  return deps.engine;
}

export async function resolveMarket(id: string, deps: BettingDeps) {
  const local = deps.getCatalogMarket(id);
  if (local && local.source !== "polymarket" && !local.clobTokenIds?.length) {
    return local;
  }
  const live = await deps.getLiveMarket(id).catch(() => null);
  return live ?? local;
}

async function resolveBook(
  market: CatalogMarket,
  outcome: QuoteRequest["outcome"],
  deps: BettingDeps,
): Promise<OrderBookSnapshot> {
  const tokenId = tokenIdFor(market, outcome);
  if (!tokenId) return syntheticBookFromMarket(market, outcome);
  try {
    const live = await deps.getBook(tokenId);
    if (!live.asks.length) return syntheticBookFromMarket(market, outcome);
    return live;
  } catch {
    if (market.source === "polymarket") throw new BettingError("POLYMARKET_CLOB", "Could not fetch the Polymarket order book.", 502);
    return syntheticBookFromMarket(market, outcome);
  }
}

function catalogToUpsert(market: CatalogMarket) {
  return {
    id: market.id,
    title: market.title,
    category: market.category,
    tag: market.tag,
    status: market.status,
    source: market.source ?? "local",
    conditionId: market.conditionId ?? null,
    clobTokenYes: market.clobTokenIds?.[0] ?? null,
    clobTokenNo: market.clobTokenIds?.[1] ?? null,
    yesPriceBps: yesChance(market) * 100,
    volumeUsd: market.volumeUsd ?? 0,
    liquidityUsd: market.liquidityUsd ?? 0,
    resolvesAt: market.resolvesAt ?? null,
    imageUrl: market.image ?? null,
    accepting: market.openSeats > 0 || market.source === "polymarket",
  };
}

async function runEngine(input: QuoteRequest, deps: BettingDeps) {
  const market = await resolveMarket(input.marketId, deps);
  if (!market) {
    throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
  }
  const snapshot = await resolveBook(market, input.outcome, deps);
  const book = snapshotToEngineBook(snapshot);
  const config = loadConfidenceEngineConfig();
  const engine = new ConfidenceEngine(config);
  const stakeMicros = parseUsdMicros(input.stakeUsd, "reject");
  const output = engine.evaluate({
    outcome: input.outcome,
    confidenceBps: confidencePctToBps(input.confidencePct),
    stakeMicros,
    book,
  });
  return { market, snapshot, book, output, stakeMicros, config };
}

export async function quotePrediction(input: QuoteRequest, deps: BettingDeps = createDefaultDeps()) {
  const { market, snapshot, output } = await runEngine(input, deps);
  if (!output.accepted) {
    return {
      accepted: false,
      engineVersion: output.version,
      rejection: { code: output.code, message: output.message },
      position: null,
      market: {
        id: market.id,
        title: market.title,
        source: market.source ?? "local",
        yesPrice: formatPrice(yesChance(market) * 100),
        tokenId: snapshot.tokenId,
      },
      book: { source: snapshot.source, hash: snapshot.hash, timestamp: snapshot.timestamp },
    } satisfies EngineQuote;
  }
  return toEngineQuote(market, output, {
    source: snapshot.source,
    hash: snapshot.hash,
    timestamp: snapshot.timestamp,
  });
}

export async function placePrediction(
  input: PlacePredictionRequest,
  deps: BettingDeps = createDefaultDeps(),
) {
  if (input.idempotencyKey) {
    const existing = await deps.store.findByIdempotency(input.walletAddress, input.idempotencyKey);
    if (existing) return toPredictionDTO(existing);
  }

  const { market, snapshot, output, stakeMicros, config } = await runEngine(input, deps);
  await deps.store.upsertMarket(catalogToUpsert(market));

  if (!output.accepted) {
    throw new BettingError(output.code, output.message, 422);
  }

  const request = executionRequest(output, snapshot, config.orderType);
  const bundle = await deps.store.createPrediction({
    walletAddress: input.walletAddress,
    marketId: market.id,
    outcome: input.outcome,
    confidenceBps: output.confidenceBps,
    stakeMicros,
    marketPriceBps: output.marketPriceBps,
    engineVersion: output.version,
    engineInputJson: jsonSafe({
      marketId: market.id,
      outcome: input.outcome,
      confidenceBps: output.confidenceBps,
      stakeUsd: input.stakeUsd,
      book: snapshot,
    }),
    engineOutputJson: serializeEngine(output),
    idempotencyKey: input.idempotencyKey,
    status: "accepted",
    position: {
      marketId: market.id,
      walletAddress: input.walletAddress,
      outcome: input.outcome,
      side: output.side,
      tokenId: output.tokenId,
      sharesMicros: output.sharesMicros,
      limitPriceBps: output.limitPriceBps,
      avgPriceBps: output.avgPriceBps,
      notionalMicros: output.notionalMicros,
      payoutMicros: output.payoutMicros,
      edgeBps: output.edgeBps,
      kellyBps: output.sizedKellyBps,
      status: "open",
      execution: {
        venue: "polymarket",
        mode: deps.executor.mode,
        status: "created",
        tokenId: output.tokenId,
        side: output.side,
        orderType: config.orderType,
        limitPriceBps: output.limitPriceBps,
        sizeSharesMicros: output.sharesMicros,
        notionalMicros: output.notionalMicros,
        requestJson: jsonSafe({
          tokenId: request.tokenId,
          side: request.side,
          orderType: request.orderType,
          price: formatPrice(request.limitPriceBps),
          size: formatShares(request.sharesMicros),
          tickSize: request.tickSize,
          negRisk: request.negRisk,
        }),
      },
    },
  });

  await getReputation(deps)
    .recordOpen({
      predictionId: bundle.id,
      walletAddress: bundle.walletAddress,
      category: bundle.market.category,
    })
    .catch(() => undefined);

  const execution = bundle.position?.executions[0];
  if (!execution || !bundle.position) return toPredictionDTO(bundle);

  try {
    const processed = await getEngine(deps).enqueueAndProcess({
      executionId: execution.id,
      positionId: bundle.position.id,
      predictionId: bundle.id,
      marketId: market.id,
      outcome: input.outcome,
      tokenId: output.tokenId,
      side: request.side,
      sharesMicros: request.sharesMicros,
      notionalMicros: request.notionalMicros,
      limitPriceBps: request.limitPriceBps,
      orderType: request.orderType,
      tickSize: request.tickSize,
      negRisk: request.negRisk,
      quotedPriceBps: output.marketPriceBps,
      bookHash: snapshot.hash,
      idempotencyKey: input.idempotencyKey ? `place:${input.idempotencyKey}` : undefined,
    });
    const allocation = processed.allocation;
    const venueOrderId =
      processed.batch?.slices.find((slice) => slice.polymarketOrderId)?.polymarketOrderId ?? null;
    if (!allocation) {
      const updated = await deps.store.applyExecutionResult(execution.id, {
        status: "failed",
        polymarketOrderId: null,
        responseJson: jsonSafe({ error: "Execution engine returned no allocation" }),
        errorMessage: "Execution engine returned no allocation",
        submittedAt: new Date(),
        positionStatus: "failed",
        fills: [],
      });
      return toPredictionDTO(updated);
    }
    await applyForeignAllocations(deps, processed, execution.id);
    const updated = await deps.store.applyExecutionResult(execution.id, {
      status:
        allocation.status === "filled" ? "filled" : allocation.status === "partial" ? "partial" : "failed",
      polymarketOrderId: venueOrderId,
      responseJson: jsonSafe({ batchId: processed.batch?.id ?? null, metrics: processed.batch?.metrics }),
      errorMessage: allocation.errorMessage ?? null,
      submittedAt: new Date(),
      positionStatus:
        allocation.status === "filled" ? "filled" : allocation.status === "partial" ? "partial" : "failed",
      fills: fillsFromAllocation(allocation),
    });
    return toPredictionDTO(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    const updated = await deps.store.applyExecutionResult(execution.id, {
      status: "failed",
      polymarketOrderId: null,
      responseJson: jsonSafe({ error: message }),
      errorMessage: message,
      submittedAt: new Date(),
      positionStatus: "failed",
      fills: [],
    });
    return toPredictionDTO(updated);
  }
}

export async function getPrediction(id: string, deps: BettingDeps = createDefaultDeps()) {
  const bundle = await deps.store.getPrediction(id);
  return bundle ? toPredictionDTO(bundle) : null;
}

export async function listPredictions(
  filter: { marketId?: string; walletAddress?: string; limit?: number },
  deps: BettingDeps = createDefaultDeps(),
) {
  const rows = await deps.store.listPredictions(filter);
  return rows.map(toPredictionDTO);
}

export async function syncExecution(executionId: string, deps: BettingDeps = createDefaultDeps()) {
  const prisma = getPrisma();
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { position: { include: { prediction: { include: { market: true, position: { include: { executions: { include: { fills: true } } } } } } } } },
  });
  if (!execution) throw new BettingError("EXECUTION_NOT_FOUND", "Execution not found.", 404);
  if (!execution.polymarketOrderId) {
    throw new BettingError("NO_VENUE_ORDER", "Execution has no Polymarket order id yet.", 409);
  }
  const snapshot = await deps.executor.getOrder(execution.polymarketOrderId);
  if (!snapshot) throw new BettingError("ORDER_NOT_FOUND", "Polymarket order not found.", 404);
  const updated = await deps.store.applyExecutionResult(execution.id, {
    status: snapshot.status,
    polymarketOrderId: snapshot.polymarketOrderId,
    responseJson: jsonSafe(snapshot.response ?? {}),
    errorMessage: snapshot.errorMessage,
    submittedAt: execution.submittedAt ?? new Date(),
    positionStatus:
      snapshot.status === "filled"
        ? "filled"
        : snapshot.status === "partial"
          ? "partial"
          : snapshot.status === "rejected" || snapshot.status === "failed"
            ? "failed"
            : "open",
    fills: snapshot.fills.map((fill) => ({
      venueTradeId: fill.venueTradeId ?? null,
      priceBps: fill.priceBps,
      sharesMicros: fill.sharesMicros,
      notionalMicros: fill.notionalMicros,
      feeMicros: 0n,
      isSimulated: fill.simulated,
      rawJson: fill.raw ? jsonSafe(fill.raw) : null,
    })),
  });
  return toPredictionDTO(updated);
}

export async function changeConfidence(
  predictionId: string,
  input: ChangeConfidenceRequest,
  deps: BettingDeps = createDefaultDeps(),
) {
  const bundle = await deps.store.getPrediction(predictionId);
  if (!bundle) throw new BettingError("NOT_FOUND", "Prediction not found.", 404);
  if (!walletsMatch(bundle.walletAddress, input.walletAddress)) {
    throw new BettingError("FORBIDDEN", "This prediction belongs to another wallet.", 403);
  }
  if (input.idempotencyKey) {
    const existing = await deps.store.findHistoryByIdempotency(predictionId, input.idempotencyKey);
    if (existing) {
      const latest = await deps.store.getPrediction(predictionId);
      return {
        prediction: toPredictionDTO(latest ?? bundle),
        history: toConfidenceHistoryDTO(existing),
      };
    }
  }

  const newConfidenceBps = confidencePctToBps(input.confidencePct);
  if (newConfidenceBps === bundle.confidenceBps) {
    throw new BettingError("UNCHANGED", "Confidence is already at that value.", 422);
  }
  if (
    input.expectedConfidencePct != null &&
    confidencePctToBps(input.expectedConfidencePct) !== bundle.confidenceBps
  ) {
    throw new BettingError(
      "CONCURRENT_UPDATE",
      "Confidence changed since this request was built. Refresh and try again.",
      409,
    );
  }

  const position = bundle.position;
  if (!position) throw new BettingError("NO_POSITION", "This prediction has no position to adjust.", 409);
  if (position.status === "adjusting") {
    throw new BettingError("CONCURRENT_UPDATE", "Another confidence change is already in flight.", 409);
  }
  if (position.status !== "filled" && position.status !== "partial") {
    throw new BettingError(
      "POSITION_NOT_READY",
      "Wait until the current position has fills before changing confidence.",
      409,
    );
  }

  const locked = await deps.store.claimAdjustmentLock(position.id);
  if (!locked) {
    throw new BettingError("CONCURRENT_UPDATE", "Another confidence change is already in flight.", 409);
  }

  const previousStatus = position.status;
  const config = loadConfidenceEngineConfig();
  let settled = false;

  try {
    const market = await resolveMarket(bundle.marketId, deps);
    if (!market) throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
    const snapshot = await resolveBook(market, bundle.outcome as QuoteRequest["outcome"], deps);
    const book = snapshotToEngineBook(snapshot);
    const livePrice = book.asks[0]?.priceBps ?? bundle.marketPriceBps;
    const quotedBps = input.quotedMarketPrice ? parsePriceBps(input.quotedMarketPrice, "floor") : undefined;
    if (isStalePrice(quotedBps, livePrice, config.maxStaleBps)) {
      throw new BettingError(
        "STALE_PRICE",
        "The market moved since this quote. Refresh the book and try again.",
        409,
      );
    }

    const held = {
      sharesMicros: position.sharesMicros,
      notionalMicros: position.notionalMicros,
      avgPriceBps: position.avgPriceBps,
    };
    const target = targetPositionFromConfidence(
      newConfidenceBps,
      bundle.stakeMicros,
      livePrice,
      config,
    );
    const plan = planAdjustment(held, target, book, config);

    if (plan.side !== "NONE" && plan.fills.length === 0) {
      throw new BettingError(
        "INSUFFICIENT_LIQUIDITY",
        "The order book cannot fill the required adjustment at the engine limit.",
        422,
      );
    }

    const previousPositionJson = jsonSafe({
      shares: formatShares(held.sharesMicros),
      notionalUsd: formatUsd(held.notionalMicros),
      avgPrice: formatPrice(held.avgPriceBps),
      status: previousStatus,
    });
    const desiredPositionJson = jsonSafe({
      shares: formatShares(target.sharesMicros),
      notionalUsd: formatUsd(target.notionalMicros),
      avgPrice: formatPrice(target.marketPriceBps),
    });

    let created: { history: ConfidenceHistoryRow; executionId: string | null };
    try {
      created = await deps.store.createHistoryAndExecution({
        history: {
          predictionId,
          previousConfidenceBps: bundle.confidenceBps,
          newConfidenceBps,
          previousSharesMicros: held.sharesMicros,
          previousNotionalMicros: held.notionalMicros,
          previousAvgPriceBps: held.avgPriceBps,
          previousPositionJson,
          desiredSharesMicros: target.sharesMicros,
          desiredNotionalMicros: target.notionalMicros,
          desiredAvgPriceBps: target.marketPriceBps,
          desiredPositionJson,
          deltaSharesMicros: plan.signedDeltaSharesMicros,
          side: plan.side,
          marketPriceBps: livePrice,
          bookHash: snapshot.hash ?? null,
          status: plan.side === "NONE" ? "noop" : "pending",
          idempotencyKey: input.idempotencyKey,
          previousPositionStatus: previousStatus,
        },
        execution:
          plan.side === "NONE"
            ? undefined
            : {
                positionId: position.id,
                venue: "polymarket",
                mode: deps.executor.mode,
                status: "created",
                tokenId: position.tokenId,
                side: plan.side,
                orderType: config.orderType,
                limitPriceBps: plan.limitPriceBps,
                sizeSharesMicros: plan.deltaSharesMicros,
                notionalMicros: plan.notionalMicros,
                requestJson: jsonSafe({
                  tokenId: position.tokenId,
                  side: plan.side,
                  orderType: config.orderType,
                  price: formatPrice(plan.limitPriceBps),
                  size: formatShares(plan.deltaSharesMicros),
                  tickSize: snapshot.tickSize,
                  negRisk: snapshot.negRisk,
                }),
              },
      });
    } catch (error) {
      if (input.idempotencyKey) {
        const existing = await deps.store.findHistoryByIdempotency(
          predictionId,
          input.idempotencyKey,
        );
        if (existing) {
          await deps.store.releaseAdjustmentLock(position.id, previousStatus);
          settled = true;
          const latest = await deps.store.getPrediction(predictionId);
          return {
            prediction: toPredictionDTO(latest ?? bundle),
            history: toConfidenceHistoryDTO(existing),
          };
        }
      }
      throw error;
    }

    if (plan.side === "NONE") {
      const updated = await deps.store.reconcileAdjustment({
        historyId: created.history.id,
        executionId: null,
        executionStatus: "noop",
        polymarketOrderId: null,
        responseJson: jsonSafe({ reason: "no inventory delta" }),
        errorMessage: null,
        submittedAt: new Date(),
        fills: [],
        position: {
          ...held,
          payoutMicros: (held.sharesMicros * 1_000_000n) / SHARE_SCALE,
          status: previousStatus,
        },
        prediction: {
          confidenceBps: newConfidenceBps,
          marketPriceBps: livePrice,
        },
        historyStatus: "noop",
      });
      settled = true;
      const history = (await deps.store.listHistory(predictionId)).find((row) => row.id === created.history.id);
      return {
        prediction: toPredictionDTO(updated),
        history: toConfidenceHistoryDTO(history ?? created.history),
      };
    }

    let processed;
    try {
      processed = await getEngine(deps).enqueueAndProcess({
        executionId: created.executionId!,
        positionId: position.id,
        predictionId,
        marketId: bundle.marketId,
        outcome: bundle.outcome as QuoteRequest["outcome"],
        tokenId: position.tokenId,
        side: plan.side,
        sharesMicros: plan.deltaSharesMicros,
        notionalMicros: plan.notionalMicros,
        limitPriceBps: plan.limitPriceBps,
        orderType: config.orderType,
        tickSize: snapshot.tickSize,
        negRisk: snapshot.negRisk,
        quotedPriceBps: livePrice,
        bookHash: snapshot.hash,
        idempotencyKey: input.idempotencyKey ? `adjust:${input.idempotencyKey}` : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";
      const updated = await deps.store.reconcileAdjustment({
        historyId: created.history.id,
        executionId: created.executionId,
        executionStatus: "failed",
        polymarketOrderId: null,
        responseJson: jsonSafe({ error: message }),
        errorMessage: message,
        submittedAt: new Date(),
        fills: [],
        position: {
          ...held,
          payoutMicros: (held.sharesMicros * 1_000_000n) / SHARE_SCALE,
          status: previousStatus,
        },
        historyStatus: "failed",
        historyErrorCode: error instanceof BettingError ? error.code : "EXECUTION_FAILED",
        historyErrorMessage: message,
      });
      settled = true;
      const history = (await deps.store.listHistory(predictionId)).find((row) => row.id === created.history.id);
      return {
        prediction: toPredictionDTO(updated),
        history: toConfidenceHistoryDTO(history ?? { ...created.history, status: "failed" }),
      };
    }

    const allocation = processed.allocation;
    const filledShares = allocation?.executedSharesMicros ?? 0n;
    const filledNotional = allocation?.executedNotionalMicros ?? 0n;
    const fullyFilled = Boolean(allocation && allocation.status === "filled" && filledShares >= plan.deltaSharesMicros);
    const failed = !allocation || allocation.status === "failed" || filledShares <= 0n;
    const nextHeld = failed
      ? held
      : applyFilledDelta(held, plan.side, filledShares, filledNotional);
    await applyForeignAllocations(deps, processed, created.executionId);

    const updated = await deps.store.reconcileAdjustment({
      historyId: created.history.id,
      executionId: created.executionId,
      executionStatus: failed ? "failed" : fullyFilled ? "filled" : "partial",
      polymarketOrderId:
        processed.batch?.slices.find((slice) => slice.polymarketOrderId)?.polymarketOrderId ?? null,
      responseJson: jsonSafe({ batchId: processed.batch?.id ?? null, metrics: processed.batch?.metrics }),
      errorMessage: allocation?.errorMessage ?? null,
      submittedAt: new Date(),
      fills: allocation ? fillsFromAllocation(allocation) : [],
      position: {
        ...nextHeld,
        payoutMicros: (nextHeld.sharesMicros * 1_000_000n) / SHARE_SCALE,
        status: failed ? previousStatus : fullyFilled ? "filled" : "partial",
        edgeBps: target.edgeBps,
        kellyBps: target.sizedKellyBps,
        limitPriceBps: plan.limitPriceBps,
      },
      prediction: failed
        ? undefined
        : fullyFilled
          ? { confidenceBps: newConfidenceBps, marketPriceBps: livePrice }
          : undefined,
      historyStatus: failed ? "failed" : fullyFilled ? "filled" : "partial",
      historyErrorCode: failed ? "EXECUTION_FAILED" : null,
      historyErrorMessage: failed ? allocation?.errorMessage ?? null : null,
    });
    settled = true;
    const history = (await deps.store.listHistory(predictionId)).find((row) => row.id === created.history.id);
    return {
      prediction: toPredictionDTO(updated),
      history: toConfidenceHistoryDTO(
        history ?? { ...created.history, status: failed ? "failed" : fullyFilled ? "filled" : "partial" },
      ),
    };
  } catch (error) {
    if (!settled) {
      await deps.store.releaseAdjustmentLock(position.id, previousStatus).catch(() => undefined);
    }
    throw error;
  }
}

export async function listConfidenceHistory(
  predictionId: string,
  deps: BettingDeps = createDefaultDeps(),
) {
  const bundle = await deps.store.getPrediction(predictionId);
  if (!bundle) throw new BettingError("NOT_FOUND", "Prediction not found.", 404);
  const rows = await deps.store.listHistory(predictionId);
  return rows.map(toConfidenceHistoryDTO);
}

export async function flushExecutions(deps: BettingDeps = createDefaultDeps()) {
  const batches = await getEngine(deps).processAll();
  for (const result of batches) {
    await applyForeignAllocations(deps, result);
  }
  return batches;
}

export async function getExecutionBatch(id: string, deps: BettingDeps = createDefaultDeps()) {
  return getEngine(deps).getBatch(id);
}

export async function enqueueMarketResolution(
  marketId: string,
  resolvedOutcome: unknown,
  deps: BettingDeps = createDefaultDeps(),
) {
  const outcome = parseOutcome(resolvedOutcome);
  const job = await getReputation(deps).enqueueResolution(marketId, outcome);
  return job;
}

export async function processReputationJobs(deps: BettingDeps = createDefaultDeps()) {
  return getReputation(deps).processJobs();
}

export async function getUserReputation(walletAddress: string, deps: BettingDeps = createDefaultDeps()) {
  return getReputation(deps).getReputation(walletAddress);
}

export async function listUserPredictions(
  walletAddress: string,
  deps: BettingDeps = createDefaultDeps(),
) {
  const predictions = await listPredictions({ walletAddress, limit: 100 }, deps);
  const scores = await getReputation(deps).listScores(walletAddress);
  const byId = new Map(scores.map((row) => [row.predictionId, row]));
  return predictions.map((prediction) => {
    const score = byId.get(prediction.id);
    return {
      ...prediction,
      resolution: score
        ? {
            resolvedOutcome: score.resolvedOutcome,
            correct: score.correct,
            brierScore: formatBrier(score.brierMicros),
            pnlUsd: formatUsd(score.pnlMicros),
            resolvedAt: score.resolvedAt.toISOString(),
          }
        : null,
    };
  });
}

function executionRequest(
  result: EngineResult,
  snapshot: OrderBookSnapshot,
  orderType: ExecutionRequest["orderType"],
): ExecutionRequest {
  return {
    tokenId: result.tokenId,
    side: "BUY",
    orderType,
    limitPriceBps: result.limitPriceBps,
    sharesMicros: result.sharesMicros,
    notionalMicros: result.notionalMicros,
    tickSize: snapshot.tickSize,
    negRisk: snapshot.negRisk,
    engine: result,
  };
}

function serializeEngine(result: EngineResult) {
  return JSON.stringify({
    version: result.version,
    outcome: result.outcome,
    tokenId: result.tokenId,
    confidenceBps: result.confidenceBps,
    marketPriceBps: result.marketPriceBps,
    edgeBps: result.edgeBps,
    kellyBps: result.kellyBps,
    sizedKellyBps: result.sizedKellyBps,
    limitPrice: formatPrice(result.limitPriceBps),
    avgPrice: formatPrice(result.avgPriceBps),
    shares: formatShares(result.sharesMicros),
    notionalUsd: formatUsd(result.notionalMicros),
    payoutUsd: formatUsd(result.payoutMicros),
    fills: result.fills.map((fill) => ({
      price: formatPrice(fill.priceBps),
      shares: formatShares(fill.sharesMicros),
      notionalUsd: formatUsd(fill.notionalMicros),
    })),
  });
}
