import type { PrismaClient } from "@prisma/client";
import type {
  ExecutionBatchRow,
  ExecutionBatchStatus,
  ExecutionIntentInput,
  ExecutionIntentRow,
  ExecutionIntentStatus,
  ExecutionMetrics,
  ExecutionSide,
  ExecutionSliceRow,
} from "@/server/execution/types";

export type ExecutionStore = {
  findIntentByIdempotency(key: string): Promise<ExecutionIntentRow | null>;
  findIntentByExecutionId(executionId: string): Promise<ExecutionIntentRow | null>;
  createIntent(input: ExecutionIntentInput): Promise<ExecutionIntentRow>;
  claimQueued(tokenId: string): Promise<ExecutionIntentRow[]>;
  releaseIntents(ids: string[], status: ExecutionIntentStatus): Promise<void>;
  createBatch(input: {
    marketId: string;
    outcome: string;
    tokenId: string;
    netSide: ExecutionSide | "NONE";
    status: ExecutionBatchStatus;
    orderType: string;
    tickSize: string;
    negRisk: boolean;
    bookHash: string | null;
    bookSnapshotJson: string | null;
    strategyJson: string | null;
    requestedSharesMicros: bigint;
    requestedNotionalMicros: bigint;
    idempotencyKey: string | null;
    intentIds: string[];
  }): Promise<ExecutionBatchRow>;
  updateBatch(
    id: string,
    patch: Partial<{
      status: ExecutionBatchStatus;
      netSide: ExecutionSide | "NONE";
      strategyJson: string | null;
      bookHash: string | null;
      bookSnapshotJson: string | null;
      metrics: ExecutionMetrics;
      attempts: number;
      errorCode: string | null;
      errorMessage: string | null;
      queuedAt: Date | null;
      submittedAt: Date | null;
      reconciledAt: Date | null;
    }>,
  ): Promise<ExecutionBatchRow>;
  addSlice(input: Omit<ExecutionSliceRow, "id" | "createdAt"> & { id?: string }): Promise<ExecutionSliceRow>;
  updateIntent(
    id: string,
    patch: Partial<{
      status: ExecutionIntentStatus;
      batchId: string | null;
      executedSharesMicros: bigint;
      executedNotionalMicros: bigint;
      avgPriceBps: number;
      feeMicros: bigint;
      errorCode: string | null;
      errorMessage: string | null;
    }>,
  ): Promise<ExecutionIntentRow>;
  getBatch(id: string): Promise<ExecutionBatchRow | null>;
  listQueuedTokenIds(): Promise<string[]>;
};

function emptyMetrics(): ExecutionMetrics {
  return {
    requestedSharesMicros: 0n,
    requestedNotionalMicros: 0n,
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
    latencyMs: 0,
  };
}

function metricsFromBatch(row: {
  requestedSharesMicros: bigint;
  requestedNotionalMicros: bigint;
  executedSharesMicros: bigint;
  executedNotionalMicros: bigint;
  venueSharesMicros: bigint;
  internalSharesMicros: bigint;
  avgPriceBps: number;
  arrivalPriceBps: number;
  expectedSlippageBps: number;
  actualSlippageBps: number;
  independentExpectedSlippageBps: number;
  measuredAggregationSlippageDeltaBps: number;
  feeMicros: bigint;
  latencyMs: number;
}): ExecutionMetrics {
  return {
    requestedSharesMicros: row.requestedSharesMicros,
    requestedNotionalMicros: row.requestedNotionalMicros,
    executedSharesMicros: row.executedSharesMicros,
    executedNotionalMicros: row.executedNotionalMicros,
    venueSharesMicros: row.venueSharesMicros,
    internalSharesMicros: row.internalSharesMicros,
    avgPriceBps: row.avgPriceBps,
    arrivalPriceBps: row.arrivalPriceBps,
    expectedSlippageBps: row.expectedSlippageBps,
    actualSlippageBps: row.actualSlippageBps,
    independentExpectedSlippageBps: row.independentExpectedSlippageBps,
    measuredAggregationSlippageDeltaBps: row.measuredAggregationSlippageDeltaBps,
    feeMicros: row.feeMicros,
    latencyMs: row.latencyMs,
  };
}

export function memoryExecutionStore(): ExecutionStore {
  const intents: ExecutionIntentRow[] = [];
  const batches: ExecutionBatchRow[] = [];
  let seq = 1;
  const nextId = () => `ex_${seq++}`;

  const hydrate = (batch: ExecutionBatchRow): ExecutionBatchRow => ({
    ...batch,
    intents: intents.filter((row) => row.batchId === batch.id),
    slices: batch.slices,
  });

  return {
    async findIntentByIdempotency(key) {
      return intents.find((row) => row.idempotencyKey === key) ?? null;
    },
    async findIntentByExecutionId(executionId) {
      return intents.find((row) => row.executionId === executionId) ?? null;
    },
    async createIntent(input) {
      const now = new Date();
      const row: ExecutionIntentRow = {
        ...input,
        id: nextId(),
        batchId: null,
        status: "QUEUED",
        executedSharesMicros: 0n,
        executedNotionalMicros: 0n,
        avgPriceBps: 0,
        feeMicros: 0n,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      };
      intents.push(row);
      return row;
    },
    async claimQueued(tokenId) {
      const claimed = intents.filter((row) => row.tokenId === tokenId && row.status === "QUEUED");
      for (const row of claimed) row.status = "PROCESSING";
      return claimed.map((row) => ({ ...row }));
    },
    async releaseIntents(ids, status) {
      for (const row of intents) {
        if (ids.includes(row.id)) {
          row.status = status;
          row.updatedAt = new Date();
        }
      }
    },
    async createBatch(input) {
      const now = new Date();
      const batch: ExecutionBatchRow = {
        id: nextId(),
        marketId: input.marketId,
        outcome: input.outcome,
        tokenId: input.tokenId,
        netSide: input.netSide,
        status: input.status,
        orderType: input.orderType,
        tickSize: input.tickSize,
        negRisk: input.negRisk,
        bookHash: input.bookHash,
        bookSnapshotJson: input.bookSnapshotJson,
        strategyJson: input.strategyJson,
        metrics: {
          ...emptyMetrics(),
          requestedSharesMicros: input.requestedSharesMicros,
          requestedNotionalMicros: input.requestedNotionalMicros,
        },
        attempts: 0,
        idempotencyKey: input.idempotencyKey,
        errorCode: null,
        errorMessage: null,
        queuedAt: now,
        submittedAt: null,
        reconciledAt: null,
        createdAt: now,
        updatedAt: now,
        intents: [],
        slices: [],
      };
      for (const id of input.intentIds) {
        const intent = intents.find((row) => row.id === id);
        if (intent) intent.batchId = batch.id;
      }
      batches.push(batch);
      return hydrate(batch);
    },
    async updateBatch(id, patch) {
      const batch = batches.find((row) => row.id === id);
      if (!batch) throw new Error("batch missing");
      if (patch.status) batch.status = patch.status;
      if (patch.netSide) batch.netSide = patch.netSide;
      if (patch.strategyJson !== undefined) batch.strategyJson = patch.strategyJson;
      if (patch.bookHash !== undefined) batch.bookHash = patch.bookHash;
      if (patch.bookSnapshotJson !== undefined) batch.bookSnapshotJson = patch.bookSnapshotJson;
      if (patch.metrics) batch.metrics = patch.metrics;
      if (patch.attempts != null) batch.attempts = patch.attempts;
      if (patch.errorCode !== undefined) batch.errorCode = patch.errorCode;
      if (patch.errorMessage !== undefined) batch.errorMessage = patch.errorMessage;
      if (patch.queuedAt !== undefined) batch.queuedAt = patch.queuedAt;
      if (patch.submittedAt !== undefined) batch.submittedAt = patch.submittedAt;
      if (patch.reconciledAt !== undefined) batch.reconciledAt = patch.reconciledAt;
      batch.updatedAt = new Date();
      return hydrate(batch);
    },
    async addSlice(input) {
      const batch = batches.find((row) => row.id === input.batchId);
      if (!batch) throw new Error("batch missing");
      const row: ExecutionSliceRow = {
        ...input,
        id: input.id ?? nextId(),
        createdAt: new Date(),
      };
      batch.slices.push(row);
      return row;
    },
    async updateIntent(id, patch) {
      const row = intents.find((item) => item.id === id);
      if (!row) throw new Error("intent missing");
      Object.assign(row, patch, { updatedAt: new Date() });
      return row;
    },
    async getBatch(id) {
      const batch = batches.find((row) => row.id === id);
      return batch ? hydrate(batch) : null;
    },
    async listQueuedTokenIds() {
      return [...new Set(intents.filter((row) => row.status === "QUEUED").map((row) => row.tokenId))];
    },
  };
}

function toIntent(row: {
  id: string;
  batchId: string | null;
  executionId: string;
  positionId: string;
  predictionId: string | null;
  marketId: string;
  outcome: string;
  tokenId: string;
  side: string;
  sharesMicros: bigint;
  notionalMicros: bigint;
  limitPriceBps: number;
  orderType: string;
  tickSize: string;
  negRisk: boolean;
  quotedPriceBps: number | null;
  bookHash: string | null;
  idempotencyKey: string | null;
  status: string;
  executedSharesMicros: bigint;
  executedNotionalMicros: bigint;
  avgPriceBps: number;
  feeMicros: bigint;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExecutionIntentRow {
  return {
    id: row.id,
    batchId: row.batchId,
    executionId: row.executionId,
    positionId: row.positionId,
    predictionId: row.predictionId ?? undefined,
    marketId: row.marketId,
    outcome: row.outcome as ExecutionIntentRow["outcome"],
    tokenId: row.tokenId,
    side: row.side as ExecutionSide,
    sharesMicros: row.sharesMicros,
    notionalMicros: row.notionalMicros,
    limitPriceBps: row.limitPriceBps,
    orderType: row.orderType as ExecutionIntentRow["orderType"],
    tickSize: row.tickSize,
    negRisk: row.negRisk,
    quotedPriceBps: row.quotedPriceBps ?? undefined,
    bookHash: row.bookHash ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    status: row.status as ExecutionIntentStatus,
    executedSharesMicros: row.executedSharesMicros,
    executedNotionalMicros: row.executedNotionalMicros,
    avgPriceBps: row.avgPriceBps,
    feeMicros: row.feeMicros,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function prismaExecutionStore(prisma: PrismaClient): ExecutionStore {
  const loadBatch = async (id: string): Promise<ExecutionBatchRow> => {
    const row = await prisma.executionBatch.findUniqueOrThrow({
      where: { id },
      include: { intents: true, slices: true },
    });
    return {
      id: row.id,
      marketId: row.marketId,
      outcome: row.outcome,
      tokenId: row.tokenId,
      netSide: row.netSide as ExecutionSide | "NONE",
      status: row.status as ExecutionBatchStatus,
      orderType: row.orderType,
      tickSize: row.tickSize,
      negRisk: row.negRisk,
      bookHash: row.bookHash,
      bookSnapshotJson: row.bookSnapshotJson,
      strategyJson: row.strategyJson,
      metrics: metricsFromBatch(row),
      attempts: row.attempts,
      idempotencyKey: row.idempotencyKey,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      queuedAt: row.queuedAt,
      submittedAt: row.submittedAt,
      reconciledAt: row.reconciledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      intents: row.intents.map(toIntent),
      slices: row.slices.map((slice) => ({
        id: slice.id,
        batchId: slice.batchId,
        side: slice.side as ExecutionSide,
        sharesMicros: slice.sharesMicros,
        notionalMicros: slice.notionalMicros,
        limitPriceBps: slice.limitPriceBps,
        orderType: slice.orderType,
        status: slice.status,
        polymarketOrderId: slice.polymarketOrderId,
        requestJson: slice.requestJson,
        responseJson: slice.responseJson,
        errorMessage: slice.errorMessage,
        attempt: slice.attempt,
        submittedAt: slice.submittedAt,
        createdAt: slice.createdAt,
      })),
    };
  };

  return {
    findIntentByIdempotency(key) {
      return prisma.executionIntent.findUnique({ where: { idempotencyKey: key } }).then((row) =>
        row ? toIntent(row) : null,
      );
    },
    findIntentByExecutionId(executionId) {
      return prisma.executionIntent.findUnique({ where: { executionId } }).then((row) =>
        row ? toIntent(row) : null,
      );
    },
    async createIntent(input) {
      const row = await prisma.executionIntent.create({
        data: {
          executionId: input.executionId,
          positionId: input.positionId,
          predictionId: input.predictionId,
          marketId: input.marketId,
          outcome: input.outcome,
          tokenId: input.tokenId,
          side: input.side,
          sharesMicros: input.sharesMicros,
          notionalMicros: input.notionalMicros,
          limitPriceBps: input.limitPriceBps,
          orderType: input.orderType,
          tickSize: input.tickSize,
          negRisk: input.negRisk,
          quotedPriceBps: input.quotedPriceBps,
          bookHash: input.bookHash,
          idempotencyKey: input.idempotencyKey,
          status: "QUEUED",
        },
      });
      return toIntent(row);
    },
    async claimQueued(tokenId) {
      const queued = await prisma.executionIntent.findMany({
        where: { tokenId, status: "QUEUED" },
      });
      if (!queued.length) return [];
      await prisma.executionIntent.updateMany({
        where: { id: { in: queued.map((row) => row.id) }, status: "QUEUED" },
        data: { status: "PROCESSING" },
      });
      const claimed = await prisma.executionIntent.findMany({
        where: { id: { in: queued.map((row) => row.id) }, status: "PROCESSING" },
      });
      return claimed.map(toIntent);
    },
    async releaseIntents(ids, status) {
      if (!ids.length) return;
      await prisma.executionIntent.updateMany({ where: { id: { in: ids } }, data: { status } });
    },
    async createBatch(input) {
      const row = await prisma.executionBatch.create({
        data: {
          marketId: input.marketId,
          outcome: input.outcome,
          tokenId: input.tokenId,
          netSide: input.netSide,
          status: input.status,
          orderType: input.orderType,
          tickSize: input.tickSize,
          negRisk: input.negRisk,
          bookHash: input.bookHash,
          bookSnapshotJson: input.bookSnapshotJson,
          strategyJson: input.strategyJson,
          requestedSharesMicros: input.requestedSharesMicros,
          requestedNotionalMicros: input.requestedNotionalMicros,
          idempotencyKey: input.idempotencyKey,
          queuedAt: new Date(),
          intents: { connect: input.intentIds.map((id) => ({ id })) },
        },
      });
      return loadBatch(row.id);
    },
    async updateBatch(id, patch) {
      await prisma.executionBatch.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.netSide ? { netSide: patch.netSide } : {}),
          ...(patch.strategyJson !== undefined ? { strategyJson: patch.strategyJson } : {}),
          ...(patch.bookHash !== undefined ? { bookHash: patch.bookHash } : {}),
          ...(patch.bookSnapshotJson !== undefined ? { bookSnapshotJson: patch.bookSnapshotJson } : {}),
          ...(patch.attempts != null ? { attempts: patch.attempts } : {}),
          ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
          ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
          ...(patch.queuedAt !== undefined ? { queuedAt: patch.queuedAt } : {}),
          ...(patch.submittedAt !== undefined ? { submittedAt: patch.submittedAt } : {}),
          ...(patch.reconciledAt !== undefined ? { reconciledAt: patch.reconciledAt } : {}),
          ...(patch.metrics
            ? {
                requestedSharesMicros: patch.metrics.requestedSharesMicros,
                requestedNotionalMicros: patch.metrics.requestedNotionalMicros,
                executedSharesMicros: patch.metrics.executedSharesMicros,
                executedNotionalMicros: patch.metrics.executedNotionalMicros,
                venueSharesMicros: patch.metrics.venueSharesMicros,
                internalSharesMicros: patch.metrics.internalSharesMicros,
                avgPriceBps: patch.metrics.avgPriceBps,
                arrivalPriceBps: patch.metrics.arrivalPriceBps,
                expectedSlippageBps: patch.metrics.expectedSlippageBps,
                actualSlippageBps: patch.metrics.actualSlippageBps,
                independentExpectedSlippageBps: patch.metrics.independentExpectedSlippageBps,
                measuredAggregationSlippageDeltaBps: patch.metrics.measuredAggregationSlippageDeltaBps,
                feeMicros: patch.metrics.feeMicros,
                latencyMs: patch.metrics.latencyMs,
              }
            : {}),
        },
      });
      return loadBatch(id);
    },
    async addSlice(input) {
      const row = await prisma.executionSlice.create({
        data: {
          batchId: input.batchId,
          side: input.side,
          sharesMicros: input.sharesMicros,
          notionalMicros: input.notionalMicros,
          limitPriceBps: input.limitPriceBps,
          orderType: input.orderType,
          status: input.status,
          polymarketOrderId: input.polymarketOrderId,
          requestJson: input.requestJson,
          responseJson: input.responseJson,
          errorMessage: input.errorMessage,
          attempt: input.attempt,
          submittedAt: input.submittedAt,
        },
      });
      return {
        id: row.id,
        batchId: row.batchId,
        side: row.side as ExecutionSide,
        sharesMicros: row.sharesMicros,
        notionalMicros: row.notionalMicros,
        limitPriceBps: row.limitPriceBps,
        orderType: row.orderType,
        status: row.status,
        polymarketOrderId: row.polymarketOrderId,
        requestJson: row.requestJson,
        responseJson: row.responseJson,
        errorMessage: row.errorMessage,
        attempt: row.attempt,
        submittedAt: row.submittedAt,
        createdAt: row.createdAt,
      };
    },
    async updateIntent(id, patch) {
      const row = await prisma.executionIntent.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.batchId !== undefined ? { batchId: patch.batchId } : {}),
          ...(patch.executedSharesMicros != null
            ? { executedSharesMicros: patch.executedSharesMicros }
            : {}),
          ...(patch.executedNotionalMicros != null
            ? { executedNotionalMicros: patch.executedNotionalMicros }
            : {}),
          ...(patch.avgPriceBps != null ? { avgPriceBps: patch.avgPriceBps } : {}),
          ...(patch.feeMicros != null ? { feeMicros: patch.feeMicros } : {}),
          ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
          ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
        },
      });
      return toIntent(row);
    },
    getBatch(id) {
      return prisma.executionBatch
        .findUnique({ where: { id } })
        .then((row) => (row ? loadBatch(row.id) : null));
    },
    async listQueuedTokenIds() {
      const rows = await prisma.executionIntent.findMany({
        where: { status: "QUEUED" },
        select: { tokenId: true },
      });
      return [...new Set(rows.map((row) => row.tokenId))];
    },
  };
}
