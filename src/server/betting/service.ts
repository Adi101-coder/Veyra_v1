import "server-only";

import { getMarket, yesChance, type Market as CatalogMarket } from "@/lib/markets";
import { getPoolMarket, poolSyntheticBook, proposerForPool } from "@/server/voting/pool";
import { poolBook } from "@/server/pools/book";
import { VEYRA_POOL_SOURCE } from "@/server/voting/config";
import { fetchPolymarketMarket } from "@/lib/polymarket";
import type { EngineQuote, PlacePredictionRequest, QuoteRequest, ChangeConfidenceRequest, OrderBookSnapshot, Outcome, PredictionDTO, PredictionScoreDTO } from "@/lib/betting";
import { ConfidenceEngine } from "@/server/confidence/engine";
import { loadConfidenceEngineConfig } from "@/server/confidence/config";
import { snapshotToEngineBook, syntheticBookForToken, syntheticBookFromMarket, tokenIdFor } from "@/server/confidence/book";
import {
  applyFilledDelta,
  isStalePrice,
  planAdjustment,
  targetPositionFromConfidence,
} from "@/server/confidence/adjust";
import type { EngineResult } from "@/server/confidence/types";
import { BettingError } from "@/server/errors";
import {
  bpsToPct,
  confidencePctToBps,
  formatPrice,
  formatShares,
  formatUsd,
  parsePriceBps,
  parseUsdMicros,
  SHARE_SCALE,
} from "@/server/money";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import {
  prismaBettingStore,
  type BettingStore,
  type ConfidenceHistoryRow,
  type PredictionBundle,
  type ReconcileAdjustmentInput,
} from "@/server/betting/repository";
import { derivePositionStatus, RECOVERED_FILL_PREFIX } from "@/server/betting/ledger";
import { toConfidenceHistoryDTO, toEngineQuote, toPredictionDTO } from "@/server/betting/mapper";
import { fetchClobBook } from "@/server/polymarket/clob";
import {
  executionMode,
  executionModeForToken,
  isPoolToken,
  type ExecutionRequest,
  type ExecutorPort,
} from "@/server/polymarket/executor";
import { clientFromExecutor, createPolymarketClient, type PolymarketClient } from "@/server/polymarket/client";
import { ExecutionEngine } from "@/server/execution/engine";
import { memoryExecutionStore, prismaExecutionStore, type ExecutionStore } from "@/server/execution/store";
import type { IntentAllocation, ProcessResult } from "@/server/execution/types";
import { ReputationEngine } from "@/server/reputation/engine";
import { memoryReputationStore, prismaReputationStore } from "@/server/reputation/store";
import type { Forecast, ForecastSource, PredictionScoreRow, ResolutionOutcome } from "@/server/reputation/types";
import { fetchVenueResolution, type VenueResolution } from "@/server/polymarket/gamma";
import { formatBrier } from "@/server/reputation/metrics";
import { parseOutcome, parseWalletAddress } from "@/server/betting/validation";

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

function executionStatusFor(allocation: IntentAllocation) {
  return allocation.status === "pending" ? "submitted" : allocation.status;
}

async function recordAllocation(
  deps: BettingDeps,
  allocation: IntentAllocation,
  batch: ProcessResult["batch"] | null | undefined,
) {
  const venueOrderId = batch?.slices.find((slice) => slice.polymarketOrderId)?.polymarketOrderId ?? null;
  const bundle = await deps.store.applyExecutionResult(allocation.executionId, {
    status: executionStatusFor(allocation),
    polymarketOrderId: venueOrderId,
    responseJson: jsonSafe({ batchId: batch?.id ?? null, batchStatus: batch?.status ?? null, metrics: batch?.metrics }),
    errorMessage: allocation.errorMessage ?? null,
    submittedAt: new Date(),
    fills: fillsFromAllocation(allocation),
  });
  // Count the prediction as opened once it holds real shares, including opening
  // orders that only fill later through reconciliation. Idempotent per prediction.
  await recordOpenIfFilled(deps, bundle).catch((error) => {
    console.error("[reputation] recordOpen failed", { predictionId: bundle.id, error: String(error) });
  });
  return bundle;
}

/** Applies allocations for intents of other predictions that shared this batch. */
async function applyForeignAllocations(
  deps: BettingDeps,
  result: { allocations: IntentAllocation[]; batch?: ProcessResult["batch"] | null },
  skipExecutionId?: string | null,
) {
  for (const allocation of result.allocations) {
    if (skipExecutionId && allocation.executionId === skipExecutionId) continue;
    try {
      await recordAllocation(deps, allocation, result.batch);
    } catch (error) {
      // The intent's execution must exist in this store; surface anything else.
      if (!(error instanceof Error) || !/missing execution|No Execution found|Record to update not found/i.test(error.message)) {
        throw error;
      }
    }
  }
}

export type BettingDeps = {
  store: BettingStore;
  executor: ExecutorPort;
  getCatalogMarket: (id: string) => CatalogMarket | null;
  /** Split-native pools, which live in the database rather than the catalog. */
  getPoolMarket?: (id: string) => Promise<CatalogMarket | null>;
  getLiveMarket: (id: string) => Promise<CatalogMarket | null>;
  getBook: (tokenId: string) => Promise<OrderBookSnapshot>;
  getResolution?: (marketId: string) => Promise<VenueResolution | null>;
  client?: PolymarketClient;
  executionStore?: ExecutionStore;
  engine?: ExecutionEngine;
  reputation?: ReputationEngine;
};

export function createDefaultDeps(): BettingDeps {
  const live = executionMode() === "live";
  const client = createPolymarketClient({
    getBook: async (tokenId) => {
      // A Split pool's book is its LMSR curve, and that curve is authoritative in
      // every mode — the pool is a real counterparty, not a stand-in for one.
      // Gating this on paper mode sent pool tokens to the CLOB in live mode, which
      // answers 404 because the token exists only in Postgres.
      if (isPoolToken(tokenId)) {
        const pool = await poolSyntheticBook(tokenId).catch(() => null);
        if (pool) return pool;
      }
      // Catalog demo tokens are fiction: paper-only, and assertExecutable refuses
      // them in live mode before execution ever gets here.
      if (!live) {
        const synthetic = syntheticBookForToken(tokenId, getMarket);
        if (synthetic) return synthetic;
      }
      return fetchClobBook(tokenId);
    },
  });
  return createPrismaDeps(getPrisma(), { client });
}

/** Production wiring over one Prisma client; tests pass a mocked venue client. */
export function createPrismaDeps(
  prisma: PrismaClient,
  venue: {
    client: PolymarketClient;
    executor?: ExecutorPort;
    getCatalogMarket?: BettingDeps["getCatalogMarket"];
    getPoolMarket?: BettingDeps["getPoolMarket"];
    getLiveMarket?: BettingDeps["getLiveMarket"];
    getResolution?: BettingDeps["getResolution"];
  },
): BettingDeps {
  const store = prismaBettingStore(prisma);
  const executionStore = prismaExecutionStore(prisma);
  const client = venue.client;
  return {
    store,
    executor: venue.executor ?? {
      mode: client.mode,
      submit: (request) => client.submitOrder(request),
      getOrder: (orderId) => client.getOrder(orderId),
    },
    client,
    executionStore,
    engine: new ExecutionEngine(client, executionStore),
    reputation: new ReputationEngine(prismaReputationStore(prisma), bettingForecastSource(store)),
    getCatalogMarket: venue.getCatalogMarket ?? getMarket,
    getPoolMarket: venue.getPoolMarket ?? ((id: string) => getPoolMarket(id)),
    getLiveMarket: venue.getLiveMarket ?? fetchPolymarketMarket,
    getResolution: venue.getResolution,
    getBook: (tokenId) => client.getBook(tokenId),
  };
}

export function bettingForecastSource(store: BettingStore): ForecastSource {
  return {
    async pendingExecutions(marketId, resolvedAt) {
      return store.countPendingExecutions(marketId, resolvedAt);
    },
    async listByMarket(marketId, resolvedAt) {
      const rows = await store.listForScoring(marketId, resolvedAt);
      return rows.map((row) => bundleToForecast(row, resolvedAt)).filter((row): row is Forecast => row !== null);
    },
  };
}

/** Scores only what actually executed: cost, proceeds and held shares come from fills. */
/**
 * Confidence in force at the resolution cutoff: the latest filled/noop change
 * requested at or before the cutoff (the venue cannot fill after resolution, so a
 * pre-cutoff request that filled is a real pre-resolution belief). Changes requested
 * after the cutoff never affect scoring. A pre-cutoff adjustment still pending when
 * the job runs is scored at the prior confidence; scores are not recomputed later.
 */
export function confidenceAtCutoff(
  bundle: { confidenceBps: number; confidenceHistory?: { createdAt: Date; status: string; previousConfidenceBps: number; newConfidenceBps: number }[] },
  cutoff: Date,
) {
  const rows = bundle.confidenceHistory;
  if (!rows?.length) return bundle.confidenceBps;
  let confidence = rows[0]!.previousConfidenceBps;
  for (const row of rows) {
    if (row.createdAt > cutoff) break;
    if (row.status === "filled" || row.status === "noop") confidence = row.newConfidenceBps;
  }
  return confidence;
}

function bundleToForecast(
  bundle: PredictionBundle & { confidenceHistory?: ConfidenceHistoryRow[] },
  cutoff: Date,
): Forecast | null {
  let costMicros = 0n;
  let proceedsMicros = 0n;
  let heldShares = 0n;
  let boughtShares = 0n;
  for (const execution of bundle.position?.executions ?? []) {
    // Only orders placed at or before the cutoff can describe the resolved position.
    if (execution.createdAt > cutoff) continue;
    for (const fill of execution.fills) {
      if (execution.side === "SELL") {
        proceedsMicros += fill.notionalMicros - fill.feeMicros;
        heldShares -= fill.sharesMicros;
      } else {
        costMicros += fill.notionalMicros + fill.feeMicros;
        heldShares += fill.sharesMicros;
        boughtShares += fill.sharesMicros;
      }
    }
  }
  // Zero-fill predictions (failed, rejected, never reconciled) are not scored.
  if (boughtShares <= 0n) return null;
  // Impossible for consistent fills: fail the job loudly instead of scoring garbage.
  if (heldShares < 0n || proceedsMicros < 0n) {
    throw new Error(`Inconsistent fills for prediction ${bundle.id}: held ${heldShares}, proceeds ${proceedsMicros}.`);
  }
  return {
    predictionId: bundle.id,
    walletAddress: bundle.walletAddress,
    marketId: bundle.marketId,
    category: bundle.market.category,
    predictedOutcome: bundle.outcome as Outcome,
    confidenceBps: confidenceAtCutoff(bundle, cutoff),
    notionalMicros: costMicros,
    // Shares held from pre-cutoff fills (each pays $1 if correct), not the live position.
    payoutMicros: heldShares,
    proceedsMicros,
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

function toScoreDTO(row: PredictionScoreRow): PredictionScoreDTO {
  return {
    resolvedOutcome: row.resolvedOutcome,
    correct: row.correct,
    brierScore: formatBrier(row.brierMicros),
    pnlUsd: formatUsd(row.pnlMicros),
    payoutUsd: formatUsd(row.payoutMicros),
    confidencePct: bpsToPct(row.confidenceBps),
    resolvedAt: row.resolvedAt.toISOString(),
  };
}

async function withScores(dtos: PredictionDTO[], deps: BettingDeps): Promise<PredictionDTO[]> {
  if (dtos.length === 0) return dtos;
  const rows = await getReputation(deps).listScoresByIds(dtos.map((dto) => dto.id));
  if (rows.length === 0) return dtos;
  const byId = new Map(rows.map((row) => [row.predictionId, row]));
  return dtos.map((dto) => {
    const row = byId.get(dto.id);
    return row ? { ...dto, score: toScoreDTO(row) } : dto;
  });
}

async function withScore(dto: PredictionDTO | null, deps: BettingDeps) {
  if (!dto) return null;
  const [next] = await withScores([dto], deps);
  return next ?? dto;
}

export async function resolveMarket(id: string, deps: BettingDeps) {
  const local = deps.getCatalogMarket(id);
  if (local && local.source !== "polymarket" && !local.clobTokenIds?.length) {
    return local;
  }
  if (!local) {
    // Split-native pools (created by a voting round) live in the database rather
    // than the static catalog, so the catalog lookup above misses them.
    const pool = deps.getPoolMarket ? await deps.getPoolMarket(id).catch(() => null) : null;
    if (pool) return pool;
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
  if (!tokenId) {
    // Catalog-only markets have no venue order book. They can only be quoted and
    // paper-traded against a clearly labelled synthetic book.
    if (market.source === "polymarket") {
      throw new BettingError("NO_ORDER_BOOK", "This Polymarket market has no CLOB token for that outcome.", 422);
    }
    if (market.source === VEYRA_POOL_SOURCE) {
      // A Split pool quotes its own AMM curve. Without liquidity it has no
      // counterparty, so it must refuse rather than show an invented price.
      const book = await poolBook(getPrisma(), market.id, outcome);
      if (!book) {
        throw new BettingError(
          "POOL_NOT_FUNDED",
          "This pool has no liquidity yet. It opens once the liquidity fund can cover it.",
          409,
        );
      }
      return book;
    }
    return syntheticBookFromMarket(market, outcome);
  }
  let live: OrderBookSnapshot;
  try {
    live = await deps.getBook(tokenId);
  } catch (error) {
    if (error instanceof BettingError && error.status === 404) {
      throw new BettingError("NO_ORDER_BOOK", "Polymarket has no order book for this market.", 422);
    }
    throw new BettingError("POLYMARKET_CLOB", "Could not fetch the Polymarket order book.", 502);
  }
  // Never size against invented liquidity for a real venue token.
  return live;
}

async function assertNotPoolProposer(market: CatalogMarket, walletAddress: string) {
  if (market.source !== VEYRA_POOL_SOURCE) return;
  const proposer = (market.proposerWallet ?? (await proposerForPool(market.id)))?.toLowerCase() ?? null;
  if (proposer && proposer === walletAddress.toLowerCase()) {
    throw new BettingError(
      "PROPOSER_CANNOT_TRADE",
      "The proposer cannot trade their own pool while Split is the counterparty.",
      403,
    );
  }
}

async function assertMarketOpen(market: CatalogMarket, deps: BettingDeps) {
  const stored = await deps.store.getMarket(market.id);
  if (stored?.resolvedAt || stored?.status === "resolved" || market.status === "resolved") {
    throw new BettingError("MARKET_RESOLVED", "This market has resolved.", 409);
  }
  if (market.source === "polymarket" && market.openSeats <= 0) {
    throw new BettingError("MARKET_CLOSED", "This market is not accepting orders.", 409);
  }
}

function assertExecutable(snapshot: OrderBookSnapshot, deps: BettingDeps) {
  // Demo catalog markets quote a made-up book, so they must not trade for real.
  // A Split pool also quotes its own book, but that book is the LMSR curve the
  // liquidity fund stands behind — it is a real counterparty, not a fiction, so it
  // stays tradable in live mode. Lumping the two together as "synthetic" is what
  // made every voted pool untradable the moment live mode was switched on.
  if (snapshot.source === "synthetic" && deps.executor.mode === "live") {
    throw new BettingError(
      "NOT_EXECUTABLE",
      "This market has no Polymarket order book and cannot be traded live.",
      422,
    );
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
  await assertMarketOpen(market, deps);
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

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
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
  await assertMarketOpen(market, deps);
  await assertNotPoolProposer(market, input.walletAddress);
  assertExecutable(snapshot, deps);
  await deps.store.upsertMarket(catalogToUpsert(market));

  if (!output.accepted) {
    throw new BettingError(output.code, output.message, 422);
  }

  const request = executionRequest(output, snapshot, config.orderType);
  let bundle;
  try {
    bundle = await deps.store.createPrediction({
      walletAddress: input.walletAddress,
      marketId: market.id,
      outcome: input.outcome,
      confidenceBps: output.confidenceBps,
      stakeMicros,
      marketPriceBps: output.marketPriceBps,
      engineVersion: output.version,
      engineInputJson: jsonSafe({
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
        // The position starts empty. Shares, notional and payout only grow from
        // recorded fills (see server/betting/ledger.ts). The engine's target size
        // lives on the execution request and in engineOutputJson.
        sharesMicros: 0n,
        limitPriceBps: output.limitPriceBps,
        avgPriceBps: 0,
        notionalMicros: 0n,
        payoutMicros: 0n,
        edgeBps: output.edgeBps,
        kellyBps: output.sizedKellyBps,
        status: "pending",
        execution: {
          venue: "polymarket",
          mode: executionModeForToken(output.tokenId, deps.executor.mode),
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
  } catch (error) {
    // Two concurrent requests with the same key: the loser returns the winner's row.
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await deps.store.findByIdempotency(input.walletAddress, input.idempotencyKey);
      if (existing) return toPredictionDTO(existing);
    }
    throw error;
  }

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
      side: "BUY",
      sharesMicros: request.sharesMicros,
      notionalMicros: request.notionalMicros,
      limitPriceBps: request.limitPriceBps,
      orderType: request.orderType,
      tickSize: request.tickSize,
      negRisk: request.negRisk,
      quotedPriceBps: output.marketPriceBps,
      bookHash: snapshot.hash,
      idempotencyKey: `place:${execution.id}`,
    });
    await applyForeignAllocations(deps, processed, execution.id);
    const allocation = processed.allocation;
    if (!allocation) {
      // Our intent was not handled by any batch in this request (e.g. stale book
      // requeue). It stays queued for the execution worker; nothing has filled.
      const updated = await deps.store.applyExecutionResult(execution.id, {
        status: processed.intent.status === "FAILED" ? "failed" : "created",
        polymarketOrderId: null,
        responseJson: jsonSafe({ intentStatus: processed.intent.status }),
        errorMessage: processed.intent.errorMessage ?? null,
        submittedAt: new Date(),
        fills: [],
      });
      return toPredictionDTO(updated);
    }
    const updated = await recordAllocation(deps, allocation, processed.batch);
    return toPredictionDTO(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    const code = error instanceof BettingError ? error.code : "EXECUTION_FAILED";
    // The engine only throws before anything reaches the venue (stale book/price or
    // setup errors). Cancel the queued intent so it can never execute later at a
    // price the user did not see.
    await getEngine(deps).cancelQueued(execution.id);
    const updated = await deps.store.applyExecutionResult(execution.id, {
      status: "failed",
      polymarketOrderId: null,
      responseJson: jsonSafe({ error: message, code }),
      errorMessage: message,
      submittedAt: new Date(),
      fills: [],
    });
    return toPredictionDTO(updated);
  }
}

async function recordOpenIfFilled(deps: BettingDeps, bundle: PredictionBundle) {
  if (!bundle.position || bundle.position.sharesMicros <= 0n) return;
  await getReputation(deps).recordOpen({
    predictionId: bundle.id,
    walletAddress: bundle.walletAddress,
    category: bundle.market.category,
  });
}

export async function getPrediction(id: string, deps: BettingDeps = createDefaultDeps()) {
  const bundle = await deps.store.getPrediction(id);
  return withScore(bundle ? toPredictionDTO(bundle) : null, deps);
}

export async function listPredictions(
  filter: { marketId?: string; walletAddress?: string; limit?: number },
  deps: BettingDeps = createDefaultDeps(),
) {
  const rows = await deps.store.listPredictions({
    ...filter,
    // Stored EVM addresses are lowercase; normalize user-supplied filters the same way.
    walletAddress: filter.walletAddress ? parseWalletAddress(filter.walletAddress) : undefined,
  });
  return withScores(rows.map(toPredictionDTO), deps);
}

/**
 * Reconciles one execution against Polymarket: re-reads the venue orders of its
 * batch and records only fills the venue reports. Safe to call repeatedly.
 */
export async function syncExecution(executionId: string, deps: BettingDeps = createDefaultDeps()) {
  const engine = getEngine(deps);
  const intent = await deps.executionStore!.findIntentByExecutionId(executionId);
  if (!intent) throw new BettingError("EXECUTION_NOT_FOUND", "Execution not found.", 404);
  if (intent.batchId) {
    const result = await engine.reconcileBatch(intent.batchId);
    if (result) await applyForeignAllocations(deps, result);
  }
  const bundle = await deps.store.findByExecutionId(executionId);
  if (!bundle) throw new BettingError("EXECUTION_NOT_FOUND", "Execution not found.", 404);
  return withScore(toPredictionDTO(bundle), deps);
}

/** Worker entry point: fail or hand to reconciliation intents a crashed worker left PROCESSING. */
export async function recoverStuckExecutions(deps: BettingDeps = createDefaultDeps()) {
  const result = await getEngine(deps).recoverStuck();
  await applyForeignAllocations(deps, { allocations: result.allocations, batch: null });
  return result.recovered;
}

/**
 * Worker entry point: positions left "adjusting" by a crashed request. Settles the
 * adjustment from what the execution layer actually recorded, never from the plan:
 *  - no pending history (crash before it was written): release the lock
 *  - execution never enqueued: the adjustment failed; nothing reached the venue
 *  - intent still queued/processing/submitted: left to execution recovery/reconcile
 *  - intent terminal but history unsettled: settle from the intent's executed totals
 */
export async function recoverStuckAdjustments(deps: BettingDeps = createDefaultDeps(), leaseMs = 5 * 60 * 1000) {
  const engine = getEngine(deps);
  const stale = await deps.store.listStaleAdjustments(new Date(Date.now() - leaseMs));
  let recovered = 0;
  for (const row of stale) {
    if (!row.historyId || !row.executionId) {
      const bundle = await deps.store.getPrediction(row.predictionId);
      if (!bundle?.position) continue;
      if (row.historyId) {
        await deps.store.reconcileAdjustment({
          historyId: row.historyId,
          executionId: null,
          executionStatus: "noop",
          polymarketOrderId: null,
          responseJson: jsonSafe({ recovered: true }),
          errorMessage: null,
          submittedAt: new Date(),
          fills: [],
        });
      } else {
        await deps.store.releaseAdjustmentLock(
          row.positionId,
          derivePositionStatus(bundle.position.executions, bundle.position.sharesMicros),
        );
      }
      recovered += 1;
      continue;
    }
    const intent = await deps.executionStore!.findIntentByExecutionId(row.executionId);
    const base = {
      historyId: row.historyId,
      executionId: row.executionId,
      polymarketOrderId: null,
      submittedAt: new Date(),
      responseJson: jsonSafe({ recovered: true, intentStatus: intent?.status ?? null }),
    };
    if (!intent) {
      await deps.store.reconcileAdjustment({
        ...base,
        executionStatus: "failed",
        errorMessage: "Adjustment request stopped before execution was queued.",
        fills: [],
        historyErrorCode: "WORKER_ABORTED",
      });
      recovered += 1;
      continue;
    }
    if (intent.status === "QUEUED") {
      if (!(await engine.cancelQueued(row.executionId))) continue;
      await deps.store.reconcileAdjustment({ ...base, executionStatus: "failed", errorMessage: "Adjustment cancelled after a crash.", fills: [], historyErrorCode: "WORKER_ABORTED" });
      recovered += 1;
      continue;
    }
    if (intent.status === "PROCESSING" || intent.status === "SUBMITTED") continue;
    const executed = intent.executedSharesMicros;
    await deps.store.reconcileAdjustment({
      ...base,
      executionStatus: intent.status === "RECONCILED" ? "filled" : intent.status === "PARTIAL" ? "partial" : "failed",
      errorMessage: intent.errorMessage,
      fills:
        executed > 0n
          ? [
              {
                venueTradeId: `${RECOVERED_FILL_PREFIX}${intent.id}`,
                priceBps: intent.avgPriceBps,
                sharesMicros: executed,
                notionalMicros: intent.executedNotionalMicros,
                feeMicros: intent.feeMicros,
                isSimulated: deps.executor.mode === "paper",
                rawJson: jsonSafe({ recoveredFromIntent: intent.id }),
              },
            ]
          : [],
    });
    recovered += 1;
  }
  return recovered;
}

/** Worker entry point: reconcile every batch still awaiting venue state. */
export async function reconcileExecutions(deps: BettingDeps = createDefaultDeps()) {
  const results = await getEngine(deps).reconcileSubmitted();
  for (const result of results) {
    await applyForeignAllocations(deps, result);
  }
  return results;
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
  const newConfidenceBps = confidencePctToBps(input.confidencePct);

  const replay = async (existing: ConfidenceHistoryRow) => {
    // The same key must mean the same request; otherwise it is a client bug.
    if (existing.newConfidenceBps !== newConfidenceBps) {
      throw new BettingError(
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for a different confidence.",
        409,
      );
    }
    const latest = await deps.store.getPrediction(predictionId);
    return { prediction: toPredictionDTO(latest ?? bundle), history: toConfidenceHistoryDTO(existing) };
  };
  if (input.idempotencyKey) {
    const existing = await deps.store.findHistoryByIdempotency(predictionId, input.idempotencyKey);
    if (existing) return replay(existing);
  }

  const config = loadConfidenceEngineConfig();
  // Same range the ConfidenceEngine enforces at placement.
  if (newConfidenceBps < config.minConfidenceBps || newConfidenceBps > config.maxConfidenceBps) {
    throw new BettingError(
      "CONFIDENCE_RANGE",
      `Confidence must be between ${config.minConfidenceBps / 100}% and ${config.maxConfidenceBps / 100}%.`,
      422,
    );
  }
  if (newConfidenceBps === bundle.confidenceBps) {
    throw new BettingError("UNCHANGED", "Confidence is already at that value.", 422);
  }
  if (input.expectedConfidencePct != null && confidencePctToBps(input.expectedConfidencePct) !== bundle.confidenceBps) {
    throw new BettingError("CONCURRENT_UPDATE", "Confidence changed since this request was built. Refresh and try again.", 409);
  }

  const position = bundle.position;
  if (!position) throw new BettingError("NO_POSITION", "This prediction has no position to adjust.", 409);
  if (position.status === "adjusting") {
    throw new BettingError("CONCURRENT_UPDATE", "Another confidence change is still being executed.", 409);
  }
  if (!ADJUSTABLE_POSITION_STATUSES.includes(position.status)) {
    throw new BettingError("POSITION_NOT_READY", "Wait until the current position has fills before changing confidence.", 409);
  }

  // Atomic: only one adjustment can move a position from an adjustable status to "adjusting".
  if (!(await deps.store.claimAdjustmentLock(position.id))) {
    throw new BettingError("CONCURRENT_UPDATE", "Another confidence change is still being executed.", 409);
  }
  const previousStatus = position.status;
  let historyCreated = false;

  try {
    // Re-read under the lock: fills or another change may have landed since the first read.
    const locked = await deps.store.getPrediction(predictionId);
    if (!locked?.position || locked.confidenceBps !== bundle.confidenceBps) {
      throw new BettingError("CONCURRENT_UPDATE", "Prediction changed; refresh and try again.", 409);
    }
    const held = {
      sharesMicros: locked.position.sharesMicros,
      notionalMicros: locked.position.notionalMicros,
      avgPriceBps: locked.position.avgPriceBps,
    };

    const market = await resolveMarket(bundle.marketId, deps);
    if (!market) throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
    await assertMarketOpen(market, deps);
    await assertNotPoolProposer(market, input.walletAddress);
    const snapshot = await resolveBook(market, bundle.outcome as QuoteRequest["outcome"], deps);
    assertExecutable(snapshot, deps);
    const book = snapshotToEngineBook(snapshot);
    const livePrice = book.asks[0]?.priceBps ?? bundle.marketPriceBps;
    const quotedBps = input.quotedMarketPrice ? parsePriceBps(input.quotedMarketPrice, "floor") : undefined;
    if (isStalePrice(quotedBps, livePrice, config.maxStaleBps)) {
      throw new BettingError("STALE_PRICE", "The market moved since this quote. Refresh the book and try again.", 409);
    }

    const target = targetPositionFromConfidence(newConfidenceBps, bundle.stakeMicros, livePrice, config);
    const plan = planAdjustment(held, target, book, config);
    if (plan.side !== "NONE" && plan.fills.length === 0) {
      throw new BettingError("INSUFFICIENT_LIQUIDITY", "The order book cannot fill the required adjustment at the engine limit.", 422);
    }

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
          previousPositionJson: jsonSafe({
            shares: formatShares(held.sharesMicros),
            notionalUsd: formatUsd(held.notionalMicros),
            avgPrice: formatPrice(held.avgPriceBps),
            status: previousStatus,
          }),
          // Desired values are a plan recorded for audit; the position never takes them.
          desiredSharesMicros: target.sharesMicros,
          desiredNotionalMicros: target.notionalMicros,
          desiredAvgPriceBps: target.marketPriceBps,
          desiredPositionJson: jsonSafe({
            shares: formatShares(target.sharesMicros),
            notionalUsd: formatUsd(target.notionalMicros),
            avgPrice: formatPrice(target.marketPriceBps),
          }),
          deltaSharesMicros: plan.signedDeltaSharesMicros,
          side: plan.side,
          marketPriceBps: livePrice,
          bookHash: snapshot.hash ?? null,
          status: "pending",
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
      // Lost a same-key race: release our lock and replay the winner's result.
      if (input.idempotencyKey && isUniqueViolation(error)) {
        const existing = await deps.store.findHistoryByIdempotency(predictionId, input.idempotencyKey);
        if (existing) {
          await deps.store.releaseAdjustmentLock(position.id, previousStatus);
          return replay(existing);
        }
      }
      throw error;
    }
    historyCreated = true;
    const positionMeta = { edgeBps: target.edgeBps, kellyBps: target.sizedKellyBps, limitPriceBps: plan.limitPriceBps };

    const settle = async (result: Omit<ReconcileAdjustmentInput, "historyId" | "executionId" | "submittedAt">) => {
      const updated = await deps.store.reconcileAdjustment({
        historyId: created.history.id,
        executionId: created.executionId,
        submittedAt: new Date(),
        ...result,
      });
      const history = (await deps.store.listHistory(predictionId)).find((row) => row.id === created.history.id);
      return { prediction: toPredictionDTO(updated), history: toConfidenceHistoryDTO(history ?? created.history) };
    };

    if (!created.executionId) {
      return settle({
        executionStatus: "noop",
        polymarketOrderId: null,
        responseJson: jsonSafe({ reason: "no inventory delta" }),
        errorMessage: null,
        fills: [],
        positionMeta,
      });
    }

    let processed;
    try {
      processed = await getEngine(deps).enqueueAndProcess({
        executionId: created.executionId,
        positionId: position.id,
        predictionId,
        marketId: bundle.marketId,
        outcome: bundle.outcome as QuoteRequest["outcome"],
        tokenId: position.tokenId,
        side: plan.side === "SELL" ? "SELL" : "BUY",
        sharesMicros: plan.deltaSharesMicros,
        notionalMicros: plan.notionalMicros,
        limitPriceBps: plan.limitPriceBps,
        orderType: config.orderType,
        tickSize: snapshot.tickSize,
        negRisk: snapshot.negRisk,
        quotedPriceBps: livePrice,
        bookHash: snapshot.hash,
        idempotencyKey: `adjust:${created.executionId}`,
      });
    } catch (error) {
      // The engine throws only before anything reached the venue.
      await getEngine(deps).cancelQueued(created.executionId);
      const message = error instanceof Error ? error.message : "Execution failed";
      return settle({
        executionStatus: "failed",
        polymarketOrderId: null,
        responseJson: jsonSafe({ error: message }),
        errorMessage: message,
        fills: [],
        historyErrorCode: error instanceof BettingError ? error.code : "EXECUTION_FAILED",
        historyErrorMessage: message,
      });
    }

    await applyForeignAllocations(deps, processed, created.executionId);
    const allocation = processed.allocation;
    if (!allocation) {
      // Not handled by any batch this request. Make sure it can never run later.
      const cancelled = await getEngine(deps).cancelQueued(created.executionId);
      if (!cancelled && processed.intent.status !== "FAILED") {
        // Claimed elsewhere and still in flight: leave it pending for the worker.
        return settle({
          executionStatus: "submitted",
          polymarketOrderId: null,
          responseJson: jsonSafe({ intentStatus: processed.intent.status }),
          errorMessage: null,
          fills: [],
        });
      }
      return settle({
        executionStatus: "failed",
        polymarketOrderId: null,
        responseJson: jsonSafe({ intentStatus: processed.intent.status }),
        errorMessage: processed.intent.errorMessage ?? "Adjustment was not executed.",
        fills: [],
      });
    }
    const status = executionStatusFor(allocation);
    return settle({
      executionStatus: status,
      polymarketOrderId: processed.batch?.slices.find((slice) => slice.polymarketOrderId)?.polymarketOrderId ?? null,
      responseJson: jsonSafe({ batchId: processed.batch?.id ?? null, metrics: processed.batch?.metrics }),
      errorMessage: allocation.errorMessage ?? null,
      fills: fillsFromAllocation(allocation),
      positionMeta: status === "failed" ? undefined : positionMeta,
      historyErrorCode: allocation.errorCode ?? null,
      historyErrorMessage: allocation.errorMessage ?? null,
    });
  } catch (error) {
    // Before the history row exists nothing was sent: release the lock unchanged.
    if (!historyCreated) {
      await deps.store.releaseAdjustmentLock(position.id, previousStatus).catch(() => undefined);
    }
    throw error;
  }
}

const ADJUSTABLE_POSITION_STATUSES = ["filled", "partial", "closed"];

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

export async function getPredictionByExecution(executionId: string, deps: BettingDeps = createDefaultDeps()) {
  const bundle = await deps.store.findByExecutionId(executionId);
  return bundle ? { id: bundle.id, walletAddress: bundle.walletAddress } : null;
}

export async function getExecutionBatch(id: string, deps: BettingDeps = createDefaultDeps()) {
  return getEngine(deps).getBatch(id);
}

function parseResolutionOutcome(value: unknown): ResolutionOutcome {
  if (typeof value === "string" && value.trim().toUpperCase() === "INVALID") return "INVALID";
  return parseOutcome(value);
}

/**
 * Operator-triggered resolution. For Polymarket markets the outcome is taken from
 * Gamma's final resolution state; a supplied outcome must agree with it. Only
 * catalog-only (non-venue) markets accept a manual outcome.
 */
export async function enqueueMarketResolution(
  marketId: string,
  requestedOutcome: unknown,
  deps: BettingDeps = createDefaultDeps(),
) {
  const stored = await deps.store.getMarket(marketId);
  const catalog = deps.getCatalogMarket(marketId);
  if (!stored && !catalog) throw new BettingError("MARKET_NOT_FOUND", "Market not found.", 404);
  const requested = requestedOutcome == null || requestedOutcome === "" ? null : parseResolutionOutcome(requestedOutcome);
  const isVenueMarket = (stored?.source ?? catalog?.source) === "polymarket";
  let outcome: ResolutionOutcome;
  if (isVenueMarket) {
    const venue = await (deps.getResolution ?? fetchVenueResolution)(marketId);
    if (!venue?.resolved) {
      throw new BettingError("NOT_RESOLVED", "Polymarket has not resolved this market yet.", 409);
    }
    if (requested && requested !== venue.outcome) {
      throw new BettingError("RESOLUTION_MISMATCH", `Polymarket resolved this market ${venue.outcome}.`, 409);
    }
    outcome = venue.outcome;
  } else {
    if (!requested) throw new BettingError("INVALID_OUTCOME", "outcome is required for non-venue markets.");
    outcome = requested;
  }
  return getReputation(deps).enqueueResolution(marketId, outcome);
}

/** Worker: resolve every open Polymarket market with Split predictions once Gamma finalizes it. */
export async function syncMarketResolutions(deps: BettingDeps = createDefaultDeps()) {
  const ids = await deps.store.listOpenVenueMarketIds();
  const results: { marketId: string; outcome?: ResolutionOutcome; error?: string }[] = [];
  for (const marketId of ids) {
    try {
      const venue = await (deps.getResolution ?? fetchVenueResolution)(marketId);
      if (!venue?.resolved) continue;
      const job = await getReputation(deps).enqueueResolution(marketId, venue.outcome);
      results.push({ marketId, outcome: job.resolvedOutcome });
    } catch (error) {
      results.push({ marketId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
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
  return predictions.map((prediction) => {
    const score = prediction.score;
    return {
      ...prediction,
      resolution: score
        ? {
            resolvedOutcome: score.resolvedOutcome,
            correct: score.correct,
            brierScore: score.brierScore,
            pnlUsd: score.pnlUsd,
            resolvedAt: score.resolvedAt,
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
