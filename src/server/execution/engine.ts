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
  ExecutionIntentRow,
  ExecutionMetrics,
  IntentAllocation,
  ProcessResult,
} from "@/server/execution/types";
import type { PolymarketClient, VenueFill, VenueOrderResult } from "@/server/polymarket/client";

function jsonSafe(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ExecutionEngine {
  private readonly locks = new Map<string, Promise<ProcessResult | null>>();

  constructor(
    private readonly client: PolymarketClient,
    private readonly store: ExecutionStore,
    private readonly config: ExecutionEngineConfig = loadExecutionEngineConfig(),
  ) {}

  async enqueue(input: ExecutionIntentInput): Promise<ExecutionIntentRow> {
    try {
      return await this.enqueueOnce(input);
    } catch (error) {
      // Concurrent enqueue of the same execution/idempotency key: return the winner.
      if ((error as { code?: string })?.code !== "P2002") throw error;
      const existing =
        (input.idempotencyKey ? await this.store.findIntentByIdempotency(input.idempotencyKey) : null) ??
        (await this.store.findIntentByExecutionId(input.executionId));
      if (!existing) throw error;
      return existing;
    }
  }

  private async enqueueOnce(input: ExecutionIntentInput) {
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
    // A run already in flight for this token may have claimed its intents before
    // ours was queued. Wait for it and process again until our intent is handled.
    for (let round = 0; round < 3; round += 1) {
      const processed = await this.processToken(intent.tokenId);
      const allocation = processed?.allocations.find((row) => row.intentId === intent.id);
      if (allocation) {
        return { intent, batch: processed?.batch ?? null, allocation, allocations: processed?.allocations ?? [] };
      }
      const current = await this.store.findIntentByExecutionId(intent.executionId);
      if (current && current.status !== "QUEUED" && current.status !== "PROCESSING") {
        const batch = current.batchId ? await this.store.getBatch(current.batchId) : null;
        return { intent: current, batch, allocation: undefined, allocations: [] };
      }
    }
    return { intent, batch: null, allocation: undefined, allocations: [] };
  }

  /**
   * Recovers intents left PROCESSING by a crashed worker. If their batch reached
   * SUBMITTED, orders may exist on the venue: hand them to reconciliation. Otherwise
   * nothing was sent: fail them (never execute later at a price nobody saw).
   */
  async recoverStuck(leaseMs = 5 * 60 * 1000) {
    const stuck = await this.store.listStaleProcessing(new Date(Date.now() - leaseMs));
    const failed: IntentAllocation[] = [];
    for (const intent of stuck) {
      // A run that still holds (and renews) its batch lease is alive: leave it.
      const lease = intent.batchId ? await this.store.claimReconcile(intent.batchId, this.config.reconcileLeaseMs) : "none";
      if (!lease) continue;
      if (lease !== "none") await this.store.releaseReconcile(intent.batchId!, lease);
      const batch = intent.batchId ? await this.store.getBatch(intent.batchId) : null;
      if (batch?.status === "SUBMITTED") {
        await this.store.releaseIntents([intent.id], "SUBMITTED");
        continue;
      }
      await this.store.updateIntent(intent.id, {
        status: "FAILED",
        errorCode: "WORKER_ABORTED",
        errorMessage: "Execution worker stopped before the order was sent.",
      });
      failed.push({
        intentId: intent.id,
        executionId: intent.executionId,
        status: "failed",
        fills: [],
        executedSharesMicros: 0n,
        executedNotionalMicros: 0n,
        avgPriceBps: 0,
        feeMicros: 0n,
        errorCode: "WORKER_ABORTED",
        errorMessage: "Execution worker stopped before the order was sent.",
      });
    }
    return { recovered: stuck.length, allocations: failed };
  }

  /** Marks a still-queued intent failed so a worker can never pick it up later. */
  async cancelQueued(executionId: string) {
    return this.store.cancelQueued(executionId);
  }

  /** Re-reads every SUBMITTED batch from the venue and allocates newly final fills. */
  async reconcileSubmitted() {
    const ids = await this.store.listBatchIdsByStatus("SUBMITTED");
    const results: ProcessResult[] = [];
    for (const id of ids) {
      const result = await this.reconcileBatch(id);
      if (result) results.push(result);
    }
    return results;
  }

  async reconcileBatch(batchId: string): Promise<ProcessResult | null> {
    // One reconciler per batch across processes: fills from a terminal venue order
    // must be allocated exactly once.
    const lease = await this.store.claimReconcile(batchId, this.config.reconcileLeaseMs);
    if (!lease) return null;
    try {
      return await this.reconcileLeased(batchId);
    } finally {
      await this.store.releaseReconcile(batchId, lease);
    }
  }

  private async reconcileLeased(batchId: string): Promise<ProcessResult | null> {
    const batch = await this.store.getBatch(batchId);
    if (!batch || batch.status !== "SUBMITTED") return null;
    // Intents still PROCESSING belong to a live (or crashed, not yet recovered) run.
    // Finalizing slices now would consume fills with nobody to allocate them to.
    if (batch.intents.some((row) => row.status === "PROCESSING")) return null;
    const unresolved = batch.slices.filter((slice) => slice.status === "open" || slice.status === "unknown");
    const newFills: VenueFill[] = [];
    let stillOpen = false;
    for (const slice of unresolved) {
      if (!slice.polymarketOrderId) {
        // Outcome unknown and no order id (e.g. a timeout). After a grace period, if
        // the venue shows no open order and no trade we cannot attribute to a known
        // order, nothing was placed: close the slice with zero fills. Any
        // unattributed activity keeps it open for operator review.
        const sentAt = slice.submittedAt ?? slice.createdAt;
        if (!this.client.findActivity || Date.now() - sentAt.getTime() < this.config.unknownOrderGraceMs) {
          stillOpen = true;
          continue;
        }
        const since = new Date(sentAt.getTime() - 60_000);
        const activity = await this.client.findActivity(batch.tokenId, since);
        const known = new Set(await this.store.listSliceOrderIds(batch.tokenId, since));
        const unattributed = [...activity.openOrderIds, ...activity.tradeOrderIds].filter((id) => !known.has(id));
        if (unattributed.length) {
          stillOpen = true;
          await this.store.updateSlice(slice.id, {
            status: "unknown",
            responseJson: jsonSafe({ unattributedOrderIds: unattributed }),
            errorMessage: "Unattributed venue activity after an unknown submission; operator review required.",
          });
          continue;
        }
        await this.store.updateSlice(slice.id, {
          status: "rejected",
          responseJson: jsonSafe({ resolvedBy: "no_venue_activity", since: since.toISOString() }),
          errorMessage: "No venue order or trade found after an unknown submission.",
        });
        continue;
      }
      const order = await this.client.getOrder(slice.polymarketOrderId);
      if (!order || order.status === "open" || order.status === "unknown") {
        stillOpen = true;
        continue;
      }
      // Fills are only taken once the order is terminal, so a slice's fills are
      // allocated exactly once (the slice leaves the unresolved set here).
      newFills.push(
        ...order.fills.map((fill) => ({
          ...fill,
          feeMicros: fill.feeMicros || feeOnNotional(fill.notionalMicros, this.config.takerFeeBps),
        })),
      );
      await this.store.updateSlice(slice.id, {
        status: order.status,
        responseJson: jsonSafe(order.response ?? {}),
        errorMessage: order.errorMessage,
      });
    }

    const pending = batch.intents.filter((row) => row.status === "SUBMITTED");
    const residual = pending.map((row) => ({ row, remaining: row.sharesMicros - row.executedSharesMicros }));
    const delta = allocateFills(pending, [], residual, newFills, this.client.mode === "paper");
    const allocations: IntentAllocation[] = [];
    for (const allocation of delta) {
      const intent = pending.find((row) => row.id === allocation.intentId)!;
      const executedShares = intent.executedSharesMicros + allocation.executedSharesMicros;
      const executedNotional = intent.executedNotionalMicros + allocation.executedNotionalMicros;
      const status: IntentAllocation["status"] = stillOpen
        ? executedShares >= intent.sharesMicros
          ? "filled"
          : "pending"
        : executedShares >= intent.sharesMicros
          ? "filled"
          : executedShares > 0n
            ? "partial"
            : "failed";
      await this.store.updateIntent(intent.id, {
        status: status === "filled" ? "RECONCILED" : status === "pending" ? "SUBMITTED" : status === "partial" ? "PARTIAL" : "FAILED",
        executedSharesMicros: executedShares,
        executedNotionalMicros: executedNotional,
        avgPriceBps: executedShares > 0n ? Number((executedNotional * 10_000n) / executedShares) : 0,
        feeMicros: intent.feeMicros + allocation.feeMicros,
        errorCode: status === "failed" ? "UNFILLED" : null,
        errorMessage: status === "failed" ? "Polymarket order closed without fills." : null,
      });
      allocations.push({ ...allocation, status });
    }

    const addedShares = newFills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
    const addedNotional = newFills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);
    const executedShares = batch.metrics.executedSharesMicros + addedShares;
    const updated = await this.store.updateBatch(batch.id, {
      status: stillOpen ? "SUBMITTED" : executedShares > 0n ? "RECONCILED" : "FAILED",
      errorCode: stillOpen ? batch.errorCode : executedShares > 0n ? null : "VENUE_FAILED",
      reconciledAt: stillOpen ? null : new Date(),
      metrics: {
        ...batch.metrics,
        executedSharesMicros: executedShares,
        executedNotionalMicros: batch.metrics.executedNotionalMicros + addedNotional,
        venueSharesMicros: batch.metrics.venueSharesMicros + addedShares,
        feeMicros: batch.metrics.feeMicros + newFills.reduce((sum, fill) => sum + fill.feeMicros, 0n),
      },
    });
    return { batch: updated, allocations };
  }

  async processAll() {
    const tokens = await this.store.listQueuedTokenIds();
    const results: ProcessResult[] = [];
    for (const tokenId of tokens) {
      try {
        const result = await this.processToken(tokenId);
        if (result) results.push(result);
      } catch (error) {
        console.error("[execution] token processing failed", { tokenId, error: String(error) });
      }
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
    const release: { fn: (() => Promise<void>) | null } = { fn: null };
    try {
      return await this.runClaimed(tokenId, release);
    } finally {
      await release.fn?.();
    }
  }

  private async runClaimed(
    tokenId: string,
    release: { fn: (() => Promise<void>) | null },
  ): Promise<ProcessResult | null> {
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

    let sentToVenue = false;
    let staleAllocations: IntentAllocation[] = [];
    // Hold the batch's reconcile lease for the whole run so no reconciler can
    // allocate this batch's venue fills while we are still sending and allocating.
    const lease = await this.store.claimReconcile(batch.id, this.config.reconcileLeaseMs);
    if (lease) release.fn = () => this.store.releaseReconcile(batch.id, lease);
    const renewLease = async () => {
      if (!lease) return;
      if (!(await this.store.renewReconcile(batch.id, lease))) {
        console.error("[execution] lost reconcile lease during a live run", { batchId: batch.id });
      }
    };
    let awaitingVenue = false;
    try {
      await this.store.updateBatch(batch.id, { status: "QUEUED", queuedAt: new Date() });
      const snapshot = await this.refreshBook(tokenId);
      // Stale quotes are judged per intent: one stale order must not block (or be
      // executed alongside) fresh ones.
      const { fresh, stale } = this.partitionStale(intents, snapshot);
      staleAllocations = await this.failIntents(
        stale,
        "STALE_PRICE",
        "The market moved since this order was quoted. Refresh the book and retry.",
      );
      if (!fresh.length) {
        const failed = await this.store.updateBatch(batch.id, {
          status: "FAILED",
          errorCode: "STALE_PRICE",
          errorMessage: "Every queued order was quoted against a stale price.",
          reconciledAt: new Date(),
        });
        return { batch: failed, allocations: staleAllocations };
      }
      const strategy = buildStrategy(fresh, snapshot, this.config);
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
        sentToVenue = true;
        for (const slice of strategy.slices) {
          const submitted = await this.submitSlice(batch.id, slice, snapshot, head.orderType, renewLease);
          venueFills.push(...submitted.fills);
          if (submitted.errorMessage) lastError = submitted.errorMessage;
          if (submitted.status === "open" || submitted.status === "unknown") awaitingVenue = true;
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
        fresh,
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

      if (strategy.blockedReason) {
        for (const allocation of allocations) {
          if (allocation.status !== "failed") continue;
          allocation.errorCode = strategy.blockedReason;
          allocation.errorMessage = strategy.notes[0] ?? "Execution blocked by a venue safety limit.";
        }
      } else if (lastError) {
        for (const allocation of allocations) {
          if (allocation.status !== "failed") continue;
          allocation.errorCode = "VENUE_FAILED";
          allocation.errorMessage = lastError;
        }
      } else if (strategy.netSide !== "NONE" && !strategy.slices.length) {
        for (const allocation of allocations) {
          if (allocation.status !== "failed") continue;
          allocation.errorCode = "NO_VENUE_SLICE";
          allocation.errorMessage = strategy.notes[0] ?? "No shares were allocated after aggregation.";
        }
      }

      if (awaitingVenue) {
        // Some venue orders are resting or their outcome is unknown. Record what is
        // known, but keep unfinished intents open until reconcileBatch() sees the
        // venue's final state. Never treat an accepted order as filled or failed.
        for (const allocation of allocations) {
          if (allocation.status !== "filled") {
            allocation.status = "pending";
            allocation.errorCode = "AWAITING_VENUE";
            allocation.errorMessage = "Order accepted by Polymarket; awaiting fill reconciliation.";
          }
        }
      }

      for (const allocation of allocations) {
        await this.store.updateIntent(allocation.intentId, {
          status:
            allocation.status === "filled"
              ? "RECONCILED"
              : allocation.status === "pending"
                ? "SUBMITTED"
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

      const finalStatus = awaitingVenue ? "SUBMITTED" : batchStatus === "FAILED" ? "FAILED" : "RECONCILED";
      const updated = await this.store.updateBatch(batch.id, {
        status: finalStatus,
        metrics,
        reconciledAt: awaitingVenue ? null : new Date(),
        errorCode: awaitingVenue ? "AWAITING_VENUE" : batchStatus === "FAILED" ? "VENUE_FAILED" : null,
        attempts: 1,
      });
      return { batch: updated, allocations: [...allocations, ...staleAllocations] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution engine failed";
      const code = error instanceof BettingError ? error.code : "ENGINE_FAILED";
      if (sentToVenue) {
        // Orders may exist on the venue. Do not mark anything failed; an operator or
        // the reconcile worker must resolve the venue state first.
        await this.store.releaseIntents(
          intents.map((row) => row.id),
          "SUBMITTED",
        );
        const held = await this.store.updateBatch(batch.id, {
          status: "SUBMITTED",
          errorCode: "RECONCILE_REQUIRED",
          errorMessage: message,
        });
        return {
          batch: held,
          allocations: intents.map((intent) => ({
            intentId: intent.id,
            executionId: intent.executionId,
            status: "pending" as const,
            fills: [],
            executedSharesMicros: 0n,
            executedNotionalMicros: 0n,
            avgPriceBps: 0,
            feeMicros: 0n,
            errorCode: "RECONCILE_REQUIRED",
            errorMessage: message,
          })),
        };
      }
      // Nothing reached the venue. Fail every claimed intent (never requeue: a stale
      // quote must not execute later at a price its owner did not see) and return
      // allocations so each owner's execution is updated.
      await this.store.releaseIntents(
        intents.map((row) => row.id),
        "FAILED",
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

  private async refreshBook(tokenId: string): Promise<OrderBookSnapshot> {
    const snapshot = await this.client.getBook(tokenId);
    if (!analyzeBook(snapshot, Date.now(), this.config.maxBookAgeMs).stale) return snapshot;
    const again = await this.client.getBook(tokenId);
    if (analyzeBook(again, Date.now(), this.config.maxBookAgeMs).stale) {
      throw new BettingError("STALE_BOOK", "Polymarket order book is stale.", 409);
    }
    return again;
  }

  /**
   * Quotes are ask-based for both sides (placement and changeConfidence record the
   * best ask as quotedPriceBps), so staleness is measured against the live ask.
   */
  private partitionStale<T extends { quotedPriceBps?: number | null }>(intents: T[], snapshot: OrderBookSnapshot) {
    const quality = analyzeBook(snapshot);
    const live = quality.bestAskBps ?? quality.midBps ?? 0;
    const fresh: T[] = [];
    const stale: T[] = [];
    for (const intent of intents) {
      if (isStaleQuotedPrice(intent.quotedPriceBps ?? undefined, live, this.config.maxStaleBps)) stale.push(intent);
      else fresh.push(intent);
    }
    return { fresh, stale };
  }

  private async failIntents(intents: ExecutionIntentRow[], code: string, message: string) {
    const allocations: IntentAllocation[] = [];
    for (const intent of intents) {
      await this.store.updateIntent(intent.id, { status: "FAILED", errorCode: code, errorMessage: message });
      allocations.push({
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
      });
    }
    return allocations;
  }

  private async submitSlice(
    batchId: string,
    slice: { side: "BUY" | "SELL"; sharesMicros: bigint; notionalMicros: bigint; limitPriceBps: number },
    snapshot: OrderBookSnapshot,
    orderType: "FAK" | "FOK" | "GTC",
    onSliceRecorded?: () => Promise<void>,
  ) {
    let last = {
      fills: [] as VenueFill[],
      errorMessage: "not submitted" as string | null,
      polymarketOrderId: null as string | null,
      status: "failed" as VenueOrderResult["status"],
    };
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      // Record the slice as "unknown" BEFORE the venue call. If the process dies
      // mid-call, reconciliation still knows an order may exist.
      const row = await this.store.addSlice({
        batchId,
        side: slice.side,
        sharesMicros: slice.sharesMicros,
        notionalMicros: slice.notionalMicros,
        limitPriceBps: slice.limitPriceBps,
        orderType,
        status: "unknown",
        polymarketOrderId: null,
        requestJson: jsonSafe({
          tokenId: snapshot.tokenId,
          side: slice.side,
          price: formatPrice(slice.limitPriceBps),
          size: formatShares(slice.sharesMicros),
          notionalUsd: formatUsd(slice.notionalMicros),
          attempt,
        }),
        responseJson: null,
        errorMessage: null,
        attempt,
        submittedAt: new Date(),
      });
      let result: VenueOrderResult;
      // Keep the batch lease alive for as long as the venue call takes, so a slow
      // Polymarket response cannot let recovery or a reconciler take over this run.
      const heartbeat = onSliceRecorded
        ? setInterval(() => void onSliceRecorded().catch(() => undefined), Math.max(1_000, Math.floor(this.config.reconcileLeaseMs / 3)))
        : null;
      if (onSliceRecorded) await onSliceRecorded();
      try {
        result = await this.client.submitOrder({
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
      } catch (error) {
        // A thrown venue call has an unknown outcome: never assume it failed.
        const message = error instanceof Error ? error.message : "Venue call failed";
        result = { mode: this.client.mode, status: "unknown", polymarketOrderId: null, response: { error: message }, fills: [], errorMessage: message };
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }
      const fills = result.fills.map((fill) => ({
        ...fill,
        feeMicros: fill.feeMicros || feeOnNotional(fill.notionalMicros, this.config.takerFeeBps),
      }));
      await this.store.updateSlice(row.id, {
        status: result.status,
        polymarketOrderId: result.polymarketOrderId,
        responseJson: jsonSafe(result.response ?? {}),
        errorMessage: result.errorMessage,
      });
      if (onSliceRecorded) await onSliceRecorded();
      last = {
        fills,
        errorMessage: result.errorMessage,
        polymarketOrderId: result.polymarketOrderId,
        status: result.status,
      };
      // Only retry when the venue refused the order before matching. An accepted,
      // resting, timed-out or partially filled order must never be re-posted.
      if (!result.retryable || attempt >= this.config.maxAttempts) return last;
      await sleep(Math.min(2_000, 100 * 2 ** (attempt - 1)));
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
