import type { Prisma, PrismaClient } from "@prisma/client";
import type { Outcome } from "@/lib/betting";
import { applyFillsToHeld, derivePositionStatus, settledHistoryStatus, unseenFills } from "@/server/betting/ledger";

export type StoredFill = {
  /** Required: fills are deduplicated per execution by this id. */
  venueTradeId: string;
  priceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  feeMicros: bigint;
  isSimulated: boolean;
  rawJson: string | null;
};

export type CreatePredictionInput = {
  walletAddress: string;
  marketId: string;
  outcome: Outcome;
  confidenceBps: number;
  stakeMicros: bigint;
  marketPriceBps: number;
  engineVersion: string;
  engineInputJson: string;
  engineOutputJson: string;
  idempotencyKey?: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  position?: {
    marketId: string;
    walletAddress: string;
    outcome: Outcome;
    side: string;
    tokenId: string;
    sharesMicros: bigint;
    limitPriceBps: number;
    avgPriceBps: number;
    notionalMicros: bigint;
    payoutMicros: bigint;
    edgeBps: number;
    kellyBps: number;
    status: string;
    execution: {
      venue: string;
      mode: string;
      status: string;
      tokenId: string;
      side: string;
      orderType: string;
      limitPriceBps: number;
      sizeSharesMicros: bigint;
      notionalMicros: bigint;
      requestJson: string;
    };
  };
};

export type MarketUpsert = {
  id: string;
  title: string;
  category: string;
  tag: string;
  status: string;
  source: string;
  conditionId?: string | null;
  clobTokenYes?: string | null;
  clobTokenNo?: string | null;
  yesPriceBps: number;
  volumeUsd: number;
  liquidityUsd: number;
  resolvesAt?: string | null;
  imageUrl?: string | null;
  accepting: boolean;
};

const bundleInclude = {
  market: true,
  position: { include: { executions: { include: { fills: true }, orderBy: { createdAt: "desc" as const } } } },
  chainSettlements: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PredictionInclude;

export type PredictionBundle = Prisma.PredictionGetPayload<{ include: typeof bundleInclude }>;

export type ConfidenceHistoryRow = {
  id: string;
  predictionId: string;
  previousConfidenceBps: number;
  newConfidenceBps: number;
  previousSharesMicros: bigint;
  previousNotionalMicros: bigint;
  previousAvgPriceBps: number;
  previousPositionJson: string;
  desiredSharesMicros: bigint;
  desiredNotionalMicros: bigint;
  desiredAvgPriceBps: number;
  desiredPositionJson: string;
  deltaSharesMicros: bigint;
  side: string;
  marketPriceBps: number;
  bookHash: string | null;
  status: string;
  idempotencyKey: string | null;
  executionId: string | null;
  previousPositionStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  reconciledAt: Date | null;
};

export type CreateHistoryInput = {
  predictionId: string;
  previousConfidenceBps: number;
  newConfidenceBps: number;
  previousSharesMicros: bigint;
  previousNotionalMicros: bigint;
  previousAvgPriceBps: number;
  previousPositionJson: string;
  desiredSharesMicros: bigint;
  desiredNotionalMicros: bigint;
  desiredAvgPriceBps: number;
  desiredPositionJson: string;
  deltaSharesMicros: bigint;
  side: string;
  marketPriceBps: number;
  bookHash?: string | null;
  status: string;
  idempotencyKey?: string;
  executionId?: string | null;
  previousPositionStatus: string;
};

export type ReconcileAdjustmentInput = {
  historyId: string;
  executionId: string | null;
  executionStatus: string;
  polymarketOrderId: string | null;
  responseJson: string;
  errorMessage: string | null;
  submittedAt: Date;
  fills: StoredFill[];
  position: {
    sharesMicros: bigint;
    notionalMicros: bigint;
    avgPriceBps: number;
    payoutMicros: bigint;
    status: string;
    edgeBps?: number;
    kellyBps?: number;
    limitPriceBps?: number;
  };
  prediction?: {
    confidenceBps: number;
    marketPriceBps: number;
    engineOutputJson?: string;
  };
  historyStatus: string;
  historyErrorCode?: string | null;
  historyErrorMessage?: string | null;
};

export type BettingStore = {
  upsertMarket(market: MarketUpsert): Promise<void>;
  getMarket(id: string): Promise<{
    id: string;
    source: string;
    status: string;
    resolvedAt: Date | null;
    resolvedOutcome: string | null;
  } | null>;
  listOpenVenueMarketIds(): Promise<string[]>;
  findByIdempotency(walletAddress: string, key: string): Promise<PredictionBundle | null>;
  getPrediction(id: string): Promise<PredictionBundle | null>;
  findByExecutionId(executionId: string): Promise<PredictionBundle | null>;
  /** All predictions for a market created at or before the cutoff (no page cap). */
  listForScoring(marketId: string, createdAtOrBefore: Date): Promise<PredictionBundle[]>;
  listPredictions(filter: {
    marketId?: string;
    walletAddress?: string;
    limit?: number;
  }): Promise<PredictionBundle[]>;
  createPrediction(input: CreatePredictionInput): Promise<PredictionBundle>;
  applyExecutionResult(
    executionId: string,
    patch: {
      status: string;
      polymarketOrderId: string | null;
      responseJson: string;
      errorMessage: string | null;
      submittedAt: Date;
      fills: StoredFill[];
    },
  ): Promise<PredictionBundle>;
  claimAdjustmentLock(positionId: string): Promise<boolean>;
  releaseAdjustmentLock(positionId: string, status: string): Promise<void>;
  findHistoryByIdempotency(predictionId: string, key: string): Promise<ConfidenceHistoryRow | null>;
  createHistoryAndExecution(input: {
    history: CreateHistoryInput;
    execution?: {
      positionId: string;
      venue: string;
      mode: string;
      status: string;
      tokenId: string;
      side: string;
      orderType: string;
      limitPriceBps: number;
      sizeSharesMicros: bigint;
      notionalMicros: bigint;
      requestJson: string;
    };
  }): Promise<{ history: ConfidenceHistoryRow; executionId: string | null }>;
  reconcileAdjustment(input: ReconcileAdjustmentInput): Promise<PredictionBundle>;
  listHistory(predictionId: string): Promise<ConfidenceHistoryRow[]>;
};

export function prismaBettingStore(prisma: PrismaClient): BettingStore {
  return {
    async upsertMarket(market) {
      await prisma.market.upsert({
        where: { id: market.id },
        create: market,
        update: {
          title: market.title,
          category: market.category,
          tag: market.tag,
          source: market.source,
          conditionId: market.conditionId,
          clobTokenYes: market.clobTokenYes,
          clobTokenNo: market.clobTokenNo,
          yesPriceBps: market.yesPriceBps,
          volumeUsd: market.volumeUsd,
          liquidityUsd: market.liquidityUsd,
          resolvesAt: market.resolvesAt,
          imageUrl: market.imageUrl,
        },
      });
      // A resolved market stays resolved: catalog refreshes must not reopen it.
      await prisma.market.updateMany({
        where: { id: market.id, resolvedAt: null },
        data: { status: market.status, accepting: market.accepting },
      });
    },

    getMarket(id) {
      return prisma.market.findUnique({
        where: { id },
        select: { id: true, source: true, status: true, resolvedAt: true, resolvedOutcome: true },
      });
    },

    async listOpenVenueMarketIds() {
      const rows = await prisma.market.findMany({
        where: { source: "polymarket", resolvedAt: null, predictions: { some: {} } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    findByIdempotency(walletAddress, key) {
      return prisma.prediction.findFirst({
        where: { walletAddress, idempotencyKey: key },
        include: bundleInclude,
      });
    },

    listForScoring(marketId, createdAtOrBefore) {
      return prisma.prediction.findMany({
        where: { marketId, createdAt: { lte: createdAtOrBefore } },
        include: bundleInclude,
        orderBy: { createdAt: "asc" },
      });
    },

    findByExecutionId(executionId) {
      return prisma.prediction.findFirst({
        where: { position: { executions: { some: { id: executionId } } } },
        include: bundleInclude,
      });
    },

    getPrediction(id) {
      return prisma.prediction.findUnique({ where: { id }, include: bundleInclude });
    },

    listPredictions({ marketId, walletAddress, limit = 50 }) {
      return prisma.prediction.findMany({
        where: {
          ...(marketId ? { marketId } : {}),
          ...(walletAddress ? { walletAddress } : {}),
        },
        include: bundleInclude,
        orderBy: { createdAt: "desc" },
        take: Math.min(100, Math.max(1, limit)),
      });
    },

    createPrediction(input) {
      return prisma.prediction.create({
        data: {
          walletAddress: input.walletAddress,
          marketId: input.marketId,
          outcome: input.outcome,
          confidenceBps: input.confidenceBps,
          stakeMicros: input.stakeMicros,
          marketPriceBps: input.marketPriceBps,
          engineVersion: input.engineVersion,
          engineInputJson: input.engineInputJson,
          engineOutputJson: input.engineOutputJson,
          idempotencyKey: input.idempotencyKey,
          status: input.status,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          position: input.position
            ? {
                create: {
                  marketId: input.position.marketId,
                  walletAddress: input.position.walletAddress,
                  outcome: input.position.outcome,
                  side: input.position.side,
                  tokenId: input.position.tokenId,
                  sharesMicros: input.position.sharesMicros,
                  limitPriceBps: input.position.limitPriceBps,
                  avgPriceBps: input.position.avgPriceBps,
                  notionalMicros: input.position.notionalMicros,
                  payoutMicros: input.position.payoutMicros,
                  edgeBps: input.position.edgeBps,
                  kellyBps: input.position.kellyBps,
                  status: input.position.status,
                  executions: {
                    create: {
                      venue: input.position.execution.venue,
                      mode: input.position.execution.mode,
                      status: input.position.execution.status,
                      tokenId: input.position.execution.tokenId,
                      side: input.position.execution.side,
                      orderType: input.position.execution.orderType,
                      limitPriceBps: input.position.execution.limitPriceBps,
                      sizeSharesMicros: input.position.execution.sizeSharesMicros,
                      notionalMicros: input.position.execution.notionalMicros,
                      requestJson: input.position.execution.requestJson,
                    },
                  },
                },
              }
            : undefined,
        },
        include: bundleInclude,
      });
    },

    async applyExecutionResult(executionId, patch) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.execution.findUniqueOrThrow({
          where: { id: executionId },
          include: { fills: { select: { venueTradeId: true } } },
        });
        const fresh = unseenFills(current.fills, patch.fills);
        await tx.execution.update({
          where: { id: executionId },
          data: {
            status: patch.status,
            polymarketOrderId: patch.polymarketOrderId ?? current.polymarketOrderId,
            responseJson: patch.responseJson,
            errorMessage: patch.errorMessage,
            submittedAt: current.submittedAt ?? patch.submittedAt,
          },
        });
        if (fresh.length) {
          await tx.fill.createMany({
            data: fresh.map((fill) => ({
              executionId,
              venueTradeId: fill.venueTradeId,
              priceBps: fill.priceBps,
              sharesMicros: fill.sharesMicros,
              notionalMicros: fill.notionalMicros,
              feeMicros: fill.feeMicros,
              isSimulated: fill.isSimulated,
              rawJson: fill.rawJson,
            })),
          });
        }
        const position = await tx.position.findUniqueOrThrow({
          where: { id: current.positionId },
          include: { executions: { select: { id: true, status: true, createdAt: true } } },
        });
        const held = applyFillsToHeld(position, current.side, fresh);
        await tx.position.update({
          where: { id: position.id },
          data: {
            sharesMicros: held.sharesMicros,
            notionalMicros: held.notionalMicros,
            avgPriceBps: held.avgPriceBps,
            payoutMicros: held.sharesMicros,
            status: derivePositionStatus(position.executions, held.sharesMicros),
          },
        });
        const settled = settledHistoryStatus(patch.status);
        if (settled) {
          const pendingHistory = await tx.confidenceHistory.findMany({
            where: { executionId, status: "pending" },
          });
          for (const row of pendingHistory) {
            await tx.confidenceHistory.update({
              where: { id: row.id },
              data: { status: settled, reconciledAt: new Date() },
            });
            if (settled === "filled") {
              await tx.prediction.update({
                where: { id: row.predictionId },
                data: { confidenceBps: row.newConfidenceBps, lockVersion: { increment: 1 } },
              });
            }
          }
        }
      });
      const execution = await prisma.execution.findUniqueOrThrow({
        where: { id: executionId },
        select: { position: { select: { predictionId: true } } },
      });
      const bundle = await prisma.prediction.findUnique({
        where: { id: execution.position.predictionId },
        include: bundleInclude,
      });
      if (!bundle) throw new Error("Prediction missing after execution update");
      return bundle;
    },

    async claimAdjustmentLock(positionId) {
      const result = await prisma.position.updateMany({
        where: { id: positionId, NOT: { status: "adjusting" } },
        data: { status: "adjusting" },
      });
      return result.count === 1;
    },

    async releaseAdjustmentLock(positionId, status) {
      await prisma.position.update({
        where: { id: positionId },
        data: { status },
      });
    },

    findHistoryByIdempotency(predictionId, key) {
      return prisma.confidenceHistory.findFirst({
        where: { predictionId, idempotencyKey: key },
      });
    },

    async createHistoryAndExecution(input) {
      return prisma.$transaction(async (tx) => {
        const execution = input.execution
          ? await tx.execution.create({
              data: {
                positionId: input.execution.positionId,
                venue: input.execution.venue,
                mode: input.execution.mode,
                status: input.execution.status,
                tokenId: input.execution.tokenId,
                side: input.execution.side,
                orderType: input.execution.orderType,
                limitPriceBps: input.execution.limitPriceBps,
                sizeSharesMicros: input.execution.sizeSharesMicros,
                notionalMicros: input.execution.notionalMicros,
                requestJson: input.execution.requestJson,
              },
            })
          : null;
        const history = await tx.confidenceHistory.create({
          data: {
            ...input.history,
            executionId: execution?.id ?? input.history.executionId ?? null,
          },
        });
        return { history, executionId: execution?.id ?? null };
      });
    },

    async reconcileAdjustment(input) {
      await prisma.$transaction(async (tx) => {
        if (input.executionId) {
          await tx.execution.update({
            where: { id: input.executionId },
            data: {
              status: input.executionStatus,
              polymarketOrderId: input.polymarketOrderId,
              responseJson: input.responseJson,
              errorMessage: input.errorMessage,
              submittedAt: input.submittedAt,
            },
          });
          if (input.fills.length) {
            await tx.fill.createMany({
              data: input.fills.map((fill) => ({
                executionId: input.executionId!,
                venueTradeId: fill.venueTradeId,
                priceBps: fill.priceBps,
                sharesMicros: fill.sharesMicros,
                notionalMicros: fill.notionalMicros,
                feeMicros: fill.feeMicros,
                isSimulated: fill.isSimulated,
                rawJson: fill.rawJson,
              })),
            });
          }
        }
        const history = await tx.confidenceHistory.update({
          where: { id: input.historyId },
          data: {
            status: input.historyStatus,
            errorCode: input.historyErrorCode ?? null,
            errorMessage: input.historyErrorMessage ?? null,
            reconciledAt: new Date(),
            executionId: input.executionId,
          },
        });
        await tx.position.update({
          where: { predictionId: history.predictionId },
          data: {
            sharesMicros: input.position.sharesMicros,
            notionalMicros: input.position.notionalMicros,
            avgPriceBps: input.position.avgPriceBps,
            payoutMicros: input.position.payoutMicros,
            status: input.position.status,
            ...(input.position.edgeBps != null ? { edgeBps: input.position.edgeBps } : {}),
            ...(input.position.kellyBps != null ? { kellyBps: input.position.kellyBps } : {}),
            ...(input.position.limitPriceBps != null
              ? { limitPriceBps: input.position.limitPriceBps }
              : {}),
          },
        });
        if (input.prediction) {
          await tx.prediction.update({
            where: { id: history.predictionId },
            data: {
              confidenceBps: input.prediction.confidenceBps,
              marketPriceBps: input.prediction.marketPriceBps,
              ...(input.prediction.engineOutputJson
                ? { engineOutputJson: input.prediction.engineOutputJson }
                : {}),
              lockVersion: { increment: 1 },
            },
          });
        }
      });
      const history = await prisma.confidenceHistory.findUniqueOrThrow({
        where: { id: input.historyId },
      });
      const bundle = await prisma.prediction.findUnique({
        where: { id: history.predictionId },
        include: bundleInclude,
      });
      if (!bundle) throw new Error("Prediction missing after adjustment reconcile");
      return bundle;
    },

    listHistory(predictionId) {
      return prisma.confidenceHistory.findMany({
        where: { predictionId },
        orderBy: { createdAt: "desc" },
      });
    },
  };
}
