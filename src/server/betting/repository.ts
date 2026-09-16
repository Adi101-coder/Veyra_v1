import type { Prisma, PrismaClient } from "@prisma/client";
import type { Outcome } from "@/lib/betting";

export type StoredFill = {
  venueTradeId: string | null;
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
  findByIdempotency(walletAddress: string, key: string): Promise<PredictionBundle | null>;
  getPrediction(id: string): Promise<PredictionBundle | null>;
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
      positionStatus: string;
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
          status: market.status,
          source: market.source,
          conditionId: market.conditionId,
          clobTokenYes: market.clobTokenYes,
          clobTokenNo: market.clobTokenNo,
          yesPriceBps: market.yesPriceBps,
          volumeUsd: market.volumeUsd,
          liquidityUsd: market.liquidityUsd,
          resolvesAt: market.resolvesAt,
          imageUrl: market.imageUrl,
          accepting: market.accepting,
        },
      });
    },

    findByIdempotency(walletAddress, key) {
      return prisma.prediction.findFirst({
        where: { walletAddress, idempotencyKey: key },
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
        const execution = await tx.execution.update({
          where: { id: executionId },
          data: {
            status: patch.status,
            polymarketOrderId: patch.polymarketOrderId,
            responseJson: patch.responseJson,
            errorMessage: patch.errorMessage,
            submittedAt: patch.submittedAt,
          },
        });
        if (patch.fills.length) {
          await tx.fill.createMany({
            data: patch.fills.map((fill) => ({
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
        await tx.position.update({
          where: { id: execution.positionId },
          data: { status: patch.positionStatus },
        });
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
