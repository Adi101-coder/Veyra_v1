import type { OrderBookSnapshot } from "@/lib/betting";
import { BettingError } from "@/server/errors";
import { formatPrice, formatShares, formatUsd } from "@/server/money";
import {
  defaultExecutionEngineConfig,
  loadExecutionEngineConfig,
  type ExecutionEngineConfig,
} from "@/server/execution/config";
import {
  allocateFills,
  analyzeBook,
  arrivalBps,
  buildStrategy,
  feeOnNotional,
  filledShares,
  isStaleQuotedPrice,
  slippageBps,
  vwapBps,
} from "@/server/execution/math";
import type { ExecutionStore } from "@/server/execution/store";
import type {
  ExecutionIntentInput,
  ExecutionMetrics,
  IntentAllocation,
  ProcessResult,
} from "@/server/execution/types";
import type { PolymarketClient, VenueFill } from "@/server/polymarket/client";

function jsonSafe(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

export class ExecutionEngine {
  private readonly locks = new Map<string, Promise<ProcessResult | null>>();

  constructor(
    private readonly client: PolymarketClient,
    private readonly store: ExecutionStore,
    private readonly config: ExecutionEngineConfig = loadExecutionEngineConfig(),
  ) {}

  async enqueue(input: ExecutionIntentInput) {
    if (input.idempotencyKey) {
      const existing = await this.store.findIntentByIdempotency(input.idempotencyKey);
      if (existing) return existing;
    }
    const prior = await this.store.findIntentByExecutionId(input.executionId);
    if (prior) return prior;
    return this.store.createIntent(input);
  }

  async enqueueAndProcess(input: ExecutionIntentInput) {
    const intent = await this.enqueue(input);
    const processed = await this.processToken(intent.tokenId);
    const allocation = processed?.allocations.find((row) => row.intentId === intent.id);
    return { intent, batch: processed?.batch ?? null, allocation, allocations: processed?.allocations ?? [] };
  }

  async processAll() {
    const tokens = await this.store.listQueuedTokenIds();
    const results: ProcessResult[] = [];
    for (const tokenId of tokens) {
      const result = await this.processToken(tokenId);
      if (result) results.push(result);
    }
    return results;
  }

  async processToken(tokenId: string): Promise<ProcessResult | null> {
    const pending = this.locks.get(tokenId);
    if (pending) return pending;
    const run = this.runToken(tokenId).finally(() => {
      this.locks.delete(tokenId);
    });
    this.locks.set(tokenId, run);
    return run;
  }

  async getBatch(id: string) {
    return this.store.getBatch(id);
  }

  private async runToken(tokenId: string): Promise<ProcessResult | null> {
    const intents = await this.store.claimQueued(tokenId);
    if (!intents.length) return null;
    const started = Date.now();
    const head = intents[0]!;
    const requestedShares = intents.reduce((sum, row) => sum + row.sharesMicros, 0n);
    const requestedNotional = intents.reduce((sum, row) => sum + row.notionalMicros, 0n);

    const batch = await this.store.createBatch({
      marketId: head.marketId,
      outcome: head.outcome,
      tokenId,
      netSide: "NONE",
      status: "CREATED",
      orderType: head.orderType,
      tickSize: head.tickSize,
      negRisk: head.negRisk,
      bookHash: head.bookHash ?? null,
      bookSnapshotJson: null,
      strategyJson: null,
      requestedSharesMicros: requestedShares,
      requestedNotionalMicros: requestedNotional,
      idempotencyKey: null,
      intentIds: intents.map((row) => row.id),
    });

    try {
      await this.store.updateBatch(batch.id, { status: "QUEUED", queuedAt: new Date() });
      const snapshot = await this.refreshBook(tokenId, intents, head.quotedPriceBps);
      const strategy = buildStrategy(intents, snapshot, this.config);
      await this.store.updateBatch(batch.id, {
        status: "QUEUED",
        netSide: strategy.netSide,
        bookHash: snapshot.hash ?? null,
        bookSnapshotJson: jsonSafe(snapshot),
        strategyJson: jsonSafe({
          notes: strategy.notes,
          slices: strategy.slices.map((slice) => ({
            side: slice.side,
            shares: formatShares(slice.sharesMicros),
            limit: formatPrice(slice.limitPriceBps),
            reason: slice.reason,
          })),
          quality: {
            spreadBps: strategy.quality.spreadBps,
            bestBidBps: strategy.quality.bestBidBps,
            bestAskBps: strategy.quality.bestAskBps,
            bidDepth: formatShares(strategy.quality.bidDepthMicros),
            askDepth: formatShares(strategy.quality.askDepthMicros),
            minOrderSize: formatShares(strategy.quality.minOrderSizeMicros),
          },
        }),
      });

      const venueFills: VenueFill[] = [];
      let lastError: string | null = null;
      if (strategy.netSide !== "NONE" && strategy.slices.length) {
        await this.store.updateBatch(batch.id, { status: "SUBMITTED", submittedAt: new Date() });
        for (const slice of strategy.slices) {
          const submitted = await this.submitSlice(batch.id, slice, snapshot, head.orderType);
          venueFills.push(...submitted.fills);
          if (submitted.errorMessage) lastError = submitted.errorMessage;
        }
      }

      const executedVenue = filledShares(venueFills);
      const batchStatus =
        strategy.netSide !== "NONE" && strategy.slices.length && executedVenue <= 0n && !strategy.matches.length
          ? "FAILED"
          : executedVenue > 0n && executedVenue < strategy.venueSharesMicros
            ? "PARTIALLY_FILLED"
            : "FILLED";
      await this.store.updateBatch(batch.id, {
        status: batchStatus === "FAILED" ? "FAILED" : batchStatus,
        errorMessage: batchStatus === "FAILED" ? lastError : null,
        errorCode: batchStatus === "FAILED" ? "VENUE_FAILED" : null,
      });

      await this.store.updateBatch(batch.id, { status: "RECONCILING" });
      const allocations = allocateFills(
        intents,
        strategy.matches,
        strategy.residual,
        venueFills.map((fill) => ({
          priceBps: fill.priceBps,
          sharesMicros: fill.sharesMicros,
          notionalMicros: fill.notionalMicros,
          feeMicros: fill.feeMicros,
          venueTradeId: fill.venueTradeId,
          simulated: fill.simulated,
        })),
        this.client.mode === "paper",
      );

      for (const allocation of allocations) {
        await this.store.updateIntent(allocation.intentId, {
          status:
            allocation.status === "filled"
              ? "RECONCILED"
              : allocation.status === "partial"
                ? "PARTIAL"
                : "FAILED",
          executedSharesMicros: allocation.executedSharesMicros,
          executedNotionalMicros: allocation.executedNotionalMicros,
          avgPriceBps: allocation.avgPriceBps,
          feeMicros: allocation.feeMicros,
          errorCode: allocation.errorCode ?? null,
          errorMessage: allocation.errorMessage ?? null,
        });
      }

      const executedShares = allocations.reduce((sum, row) => sum + row.executedSharesMicros, 0n);
      const executedNotional = allocations.reduce((sum, row) => sum + row.executedNotionalMicros, 0n);
      const fees = allocations.reduce((sum, row) => sum + row.feeMicros, 0n);
      const avg = vwapBps(
        allocations.flatMap((row) =>
          row.fills.map((fill) => ({
            priceBps: fill.priceBps,
            sharesMicros: fill.sharesMicros,
            notionalMicros: fill.notionalMicros,
          })),
        ),
      );
      const arrival = strategy.netSide === "NONE" ? (strategy.quality.midBps ?? 0) : arrivalBps(strategy.quality, strategy.netSide);
      const actualSlip =
        strategy.netSide === "NONE" ? 0 : slippageBps(strategy.netSide, arrival, avg || strategy.expectedVenueAvgBps);
      const metrics: ExecutionMetrics = {
        requestedSharesMicros: requestedShares,
        requestedNotionalMicros: requestedNotional,
        executedSharesMicros: executedShares,
        executedNotionalMicros: executedNotional,
        venueSharesMicros: executedVenue,
        internalSharesMicros: strategy.internalSharesMicros,
        avgPriceBps: avg,
        arrivalPriceBps: arrival,
        expectedSlippageBps: strategy.expectedSlippageBps,
        actualSlippageBps: actualSlip,
        independentExpectedSlippageBps: strategy.independentExpectedSlippageBps,
        measuredAggregationSlippageDeltaBps:
          strategy.expectedSlippageBps - strategy.independentExpectedSlippageBps,
        feeMicros: fees,
        latencyMs: Date.now() - started,
      };

      const finalStatus = batchStatus === "FAILED" ? "FAILED" : "RECONCILED";
      const updated = await this.store.updateBatch(batch.id, {
        status: finalStatus,
        metrics,
        reconciledAt: new Date(),
        attempts: 1,
      });
      return { batch: updated, allocations };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution engine failed";
      const code = error instanceof BettingError ? error.code : "ENGINE_FAILED";
      await this.store.releaseIntents(
        intents.map((row) => row.id),
        code === "STALE_BOOK" || code === "STALE_PRICE" ? "QUEUED" : "FAILED",
      );
      const failed = await this.store.updateBatch(batch.id, {
        status: "FAILED",
        errorCode: code,
        errorMessage: message,
        reconciledAt: new Date(),
        metrics: {
          requestedSharesMicros: requestedShares,
          requestedNotionalMicros: requestedNotional,
          executedSharesMicros: 0n,
          executedNotionalMicros: 0n,
          venueSharesMicros: 0n,
          internalSharesMicros: 0n,
          avgPriceBps: 0,
          arrivalPriceBps: 0,
          expectedSlippageBps: 0,
          actualSlippageBps: 0,
          independentExpectedSlippageBps: 0,
          measuredAggregationSlippageDeltaBps: 0,
          feeMicros: 0n,
          latencyMs: Date.now() - started,
        },
      });
      if (code === "STALE_BOOK" || code === "STALE_PRICE") throw error;
      const allocations: IntentAllocation[] = intents.map((intent) => ({
        intentId: intent.id,
        executionId: intent.executionId,
        status: "failed",
        fills: [],
        executedSharesMicros: 0n,
        executedNotionalMicros: 0n,
        avgPriceBps: 0,
        feeMicros: 0n,
        errorCode: code,
        errorMessage: message,
      }));
      return { batch: failed, allocations };
    }
  }

  private async refreshBook(
    tokenId: string,
    intents: { quotedPriceBps?: number }[],
    quotedFallback?: number,
  ): Promise<OrderBookSnapshot> {
    const snapshot = await this.client.getBook(tokenId);
    const quality = analyzeBook(snapshot, Date.now(), this.config.maxBookAgeMs);
    if (quality.stale) {
      const again = await this.client.getBook(tokenId);
      const retry = analyzeBook(again, Date.now(), this.config.maxBookAgeMs);
      if (retry.stale) {
        throw new BettingError("STALE_BOOK", "Polymarket order book is stale.", 409);
      }
      return this.assertQuotes(again, retry, intents, quotedFallback);
    }
    return this.assertQuotes(snapshot, quality, intents, quotedFallback);
  }

  private assertQuotes(
    snapshot: OrderBookSnapshot,
    quality: ReturnType<typeof analyzeBook>,
    intents: { quotedPriceBps?: number }[],
    quotedFallback?: number,
  ) {
    const live = quality.bestAskBps ?? quality.midBps ?? 0;
    const quoted = intents.find((row) => row.quotedPriceBps != null)?.quotedPriceBps ?? quotedFallback;
    if (isStaleQuotedPrice(quoted, live, this.config.maxStaleBps)) {
      throw new BettingError(
        "STALE_PRICE",
        "The market moved since these orders were queued. Refresh the book and retry.",
        409,
      );
    }
    return snapshot;
  }

  private async submitSlice(
    batchId: string,
    slice: { side: "BUY" | "SELL"; sharesMicros: bigint; notionalMicros: bigint; limitPriceBps: number },
    snapshot: OrderBookSnapshot,
    orderType: "FAK" | "FOK" | "GTC",
  ) {
    let last = {
      fills: [] as VenueFill[],
      errorMessage: "not submitted" as string | null,
      polymarketOrderId: null as string | null,
    };
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      const result = await this.client.submitOrder({
        tokenId: snapshot.tokenId,
        side: slice.side,
        orderType,
        limitPriceBps: slice.limitPriceBps,
        sharesMicros: slice.sharesMicros,
        notionalMicros: slice.notionalMicros,
        tickSize: snapshot.tickSize,
        negRisk: snapshot.negRisk,
        book: snapshot,
      });
      const fills = result.fills.map((fill) => ({
        ...fill,
        feeMicros: fill.feeMicros || feeOnNotional(fill.notionalMicros, this.config.takerFeeBps),
      }));
      await this.store.addSlice({
        batchId,
        side: slice.side,
        sharesMicros: slice.sharesMicros,
        notionalMicros: slice.notionalMicros,
        limitPriceBps: slice.limitPriceBps,
        orderType,
        status: result.status,
        polymarketOrderId: result.polymarketOrderId,
        requestJson: jsonSafe({
          tokenId: snapshot.tokenId,
          side: slice.side,
          price: formatPrice(slice.limitPriceBps),
          size: formatShares(slice.sharesMicros),
          notionalUsd: formatUsd(slice.notionalMicros),
          attempt,
        }),
        responseJson: jsonSafe(result.response ?? {}),
        errorMessage: result.errorMessage,
        attempt,
        submittedAt: new Date(),
      });
      last = { fills, errorMessage: result.errorMessage, polymarketOrderId: result.polymarketOrderId };
      if (result.status === "filled" || result.status === "partial" || filledShares(fills) > 0n) {
        return last;
      }
      if (result.status === "rejected") break;
    }
    return last;
  }
}

export function createExecutionEngine(
  client: PolymarketClient,
  store: ExecutionStore,
  config: ExecutionEngineConfig = defaultExecutionEngineConfig,
) {
  return new ExecutionEngine(client, store, config);
}
