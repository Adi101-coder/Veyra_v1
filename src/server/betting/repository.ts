import type { Prisma, PrismaClient } from "@prisma/client";
import type { Outcome } from "@/lib/betting";
import { applyFillsToHeld, derivePositionStatus, settledHistoryStatus, unseenFills } from "@/server/betting/ledger";
import { withUniqueRetry } from "@/server/prisma-retry";
import { orderReserveMicros, reserveFunds, settlesInCash } from "@/server/treasury/funds";

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

/**
 * Settles a Change-Your-Mind adjustment from its execution result. Stores apply only
 * the recorded fills through the position ledger (never a caller-computed position);
 * confidence moves to the new value only when the adjustment execution is filled.
 */
export type ReconcileAdjustmentInput = {
  historyId: string;
  /** null = no inventory delta was needed (noop). */
  executionId: string | null;
  executionStatus: string;
  polymarketOrderId: string | null;
  responseJson: string;
  errorMessage: string | null;
  submittedAt: Date;
  fills: StoredFill[];
  positionMeta?: { edgeBps: number; kellyBps: number; limitPriceBps: number };
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
  /** Executions on this market's pre-cutoff predictions whose venue outcome is not final. */
  countPendingExecutions(marketId: string, createdAtOrBefore: Date): Promise<number>;
  /** All predictions for a market created at or before the cutoff (no page cap). */
  listForScoring(
    marketId: string,
    createdAtOrBefore: Date,
  ): Promise<(PredictionBundle & { confidenceHistory?: ConfidenceHistoryRow[] })[]>;
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
  /** Positions locked "adjusting" longer than the cutoff, with any pending history/execution. */
  listStaleAdjustments(lockedBefore: Date): Promise<{ positionId: string; predictionId: string; historyId: string | null; executionId: string | null }[]>;
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

/** The row shape for a new prediction, shared by the funded and unfunded paths. */
function predictionData(input: CreatePredictionInput): Prisma.PredictionUncheckedCreateInput {
  return {
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
  };
}

export function prismaBettingStore(prisma: PrismaClient): BettingStore {
  return {
    async upsertMarket(market) {
      // Two first-time bets on the same market race here: on PostgreSQL the losing
      // upsert raises P2002 instead of being serialised, so retry it.
      await withUniqueRetry(() => prisma.market.upsert({
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
      }));
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

    countPendingExecutions(marketId, createdAtOrBefore) {
      return prisma.execution.count({
        where: {
          createdAt: { lte: createdAtOrBefore },
          status: { in: ["created", "submitted", "open", "unknown"] },
          position: { marketId },
        },
      });
    },

    listForScoring(marketId, createdAtOrBefore) {
      return prisma.prediction.findMany({
        where: { marketId, createdAt: { lte: createdAtOrBefore } },
        include: { ...bundleInclude, confidenceHistory: { orderBy: { createdAt: "asc" } } },
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
      // With custody off nothing needs to move, so this stays a single create on the
      // path that has been audited and load-tested. Only a funded order opens a
      // transaction, and then funds are reserved inside it: INSUFFICIENT_FUNDS rolls
      // the whole thing back, order row included, so a user can never hold an order
      // they could not fund.
      const needsCash =
        Boolean(input.position) && settlesInCash(input.position?.execution.mode ?? "paper");
      if (!needsCash) {
        return prisma.prediction.create({
          data: predictionData(input),
          include: bundleInclude,
        });
      }
      return prisma.$transaction(async (tx) => {
        const bundle = await tx.prediction.create({
          data: predictionData(input),
          include: bundleInclude,
        });

        // Live orders are funded by the user who placed them. Paper orders are
        // simulated, so they never touch a real balance (see treasury/funds.ts).
        const execution = bundle.position?.executions[0];
        if (execution && settlesInCash(execution.mode) && input.position) {
          await reserveFunds(tx, {
            walletAddress: input.walletAddress,
            executionId: execution.id,
            amountMicros: orderReserveMicros(input.position.execution.notionalMicros),
          });
        }
        return bundle;
      });
    },

    async applyExecutionResult(executionId, patch) {
      // A concurrent writer recording the same venue fills makes the unique
      // (executionId, venueTradeId) insert fail and roll back; retrying re-reads the
      // recorded fills and applies nothing twice.
      await withUniqueRetry(() => prisma.$transaction(async (tx) => {
        // Serialize writers on this position: PostgreSQL READ COMMITTED would
        // otherwise let two concurrent fill writers read the same shares and lose one
        // update. The lock is taken before any read that feeds the new position.
        const owner = await tx.execution.findUniqueOrThrow({ where: { id: executionId }, select: { positionId: true } });
        await tx.$queryRaw`SELECT "id" FROM "Position" WHERE "id" = ${owner.positionId} FOR UPDATE`;
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
              data: {
                status: settled,
                reconciledAt: new Date(),
                errorCode: settled === "failed" ? "EXECUTION_FAILED" : null,
                errorMessage: settled === "failed" ? patch.errorMessage : null,
              },
            });
            if (settled === "filled") {
              await tx.prediction.update({
                where: { id: row.predictionId },
                data: { confidenceBps: row.newConfidenceBps, marketPriceBps: row.marketPriceBps, lockVersion: { increment: 1 } },
              });
            }
          }
        }
      }));
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
        // Only an adjustable position can be locked; never a pending/failed/adjusting one.
        where: { id: positionId, status: { in: ["filled", "partial", "closed"] } },
        data: { status: "adjusting" },
      });
      return result.count === 1;
    },

    async listStaleAdjustments(lockedBefore) {
      const positions = await prisma.position.findMany({
        where: { status: "adjusting", updatedAt: { lt: lockedBefore } },
        select: { id: true, predictionId: true },
        take: 100,
      });
      const result = [];
      for (const position of positions) {
        const history = await prisma.confidenceHistory.findFirst({
          where: { predictionId: position.predictionId, status: "pending" },
          orderBy: { createdAt: "desc" },
        });
        result.push({ positionId: position.id, predictionId: position.predictionId, historyId: history?.id ?? null, executionId: history?.executionId ?? null });
      }
      return result;
    },

    async releaseAdjustmentLock(positionId, status) {
      // Only undo our own lock; never overwrite a status another writer settled.
      await prisma.position.updateMany({
        where: { id: positionId, status: "adjusting" },
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
        if (execution && input.execution && input.execution.side === "BUY" && settlesInCash(input.execution.mode)) {
          const position = await tx.position.findUniqueOrThrow({
            where: { id: input.execution.positionId },
            select: { walletAddress: true },
          });
          await reserveFunds(tx, {
            walletAddress: position.walletAddress,
            executionId: execution.id,
            amountMicros: orderReserveMicros(input.execution.notionalMicros),
          });
        }
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
      const predictionId = await withUniqueRetry(() =>
        prisma.$transaction(async (tx) => {
          const history = await tx.confidenceHistory.findUniqueOrThrow({ where: { id: input.historyId } });
          if (history.status !== "pending") return history.predictionId; // already settled: idempotent
          // Same lock as applyExecutionResult: the position is read and rewritten below.
          await tx.$queryRaw`SELECT "id" FROM "Position" WHERE "predictionId" = ${history.predictionId} FOR UPDATE`;
          const prediction = await tx.prediction.findUniqueOrThrow({
            where: { id: history.predictionId },
            include: { position: { include: { executions: { select: { id: true, status: true, createdAt: true } } } } },
          });
          const position = prediction.position!;

          let historyStatus: string;
          if (input.executionId) {
            const current = await tx.execution.findUniqueOrThrow({
              where: { id: input.executionId },
              include: { fills: { select: { venueTradeId: true } } },
            });
            const fresh = unseenFills(current.fills, input.fills);
            await tx.execution.update({
              where: { id: input.executionId },
              data: {
                status: input.executionStatus,
                polymarketOrderId: input.polymarketOrderId ?? current.polymarketOrderId,
                responseJson: input.responseJson,
                errorMessage: input.errorMessage,
                submittedAt: current.submittedAt ?? input.submittedAt,
              },
            });
            if (fresh.length) {
              await tx.fill.createMany({ data: fresh.map((fill) => ({ executionId: input.executionId!, ...fill })) });
            }
            const held = applyFillsToHeld(position, current.side, fresh);
            const executions = position.executions.map((row) =>
              row.id === input.executionId ? { ...row, status: input.executionStatus } : row,
            );
            await tx.position.update({
              where: { id: position.id },
              data: {
                sharesMicros: held.sharesMicros,
                notionalMicros: held.notionalMicros,
                avgPriceBps: held.avgPriceBps,
                payoutMicros: held.sharesMicros,
                status: derivePositionStatus(executions, held.sharesMicros),
                ...(input.positionMeta ?? {}),
              },
            });
            historyStatus = settledHistoryStatus(input.executionStatus) ?? "pending";
          } else {
            await tx.position.update({
              where: { id: position.id },
              data: { status: derivePositionStatus(position.executions, position.sharesMicros), ...(input.positionMeta ?? {}) },
            });
            historyStatus = "noop";
          }

          await tx.confidenceHistory.update({
            where: { id: history.id },
            data: {
              status: historyStatus,
              reconciledAt: historyStatus === "pending" ? null : new Date(),
              errorCode: historyStatus === "failed" ? (input.historyErrorCode ?? "EXECUTION_FAILED") : null,
              errorMessage: historyStatus === "failed" ? (input.historyErrorMessage ?? input.errorMessage) : null,
            },
          });
          if (historyStatus === "filled" || historyStatus === "noop") {
            await tx.prediction.update({
              where: { id: history.predictionId },
              data: {
                confidenceBps: history.newConfidenceBps,
                marketPriceBps: history.marketPriceBps,
                lockVersion: { increment: 1 },
              },
            });
          }
          return history.predictionId;
        }),
      );
      const bundle = await prisma.prediction.findUnique({ where: { id: predictionId }, include: bundleInclude });
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
