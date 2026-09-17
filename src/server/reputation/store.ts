import { BettingError } from "@/server/errors";
import { isUniqueViolation, withUniqueRetry } from "@/server/prisma-retry";
import type { PrismaClient } from "@prisma/client";
import { BIN_COUNT } from "@/server/reputation/metrics";
import type {
  PredictionScoreRow,
  ReputationJobRow,
  ReputationSnapshot,
  ReputationStore,
  ResolutionOutcome,
} from "@/server/reputation/types";

function emptySnapshot(walletAddress: string): ReputationSnapshot {
  return {
    walletAddress,
    totalPredictions: 0,
    resolvedPredictions: 0,
    correctPredictions: 0,
    confidenceSumBps: 0n,
    brierSumMicros: 0n,
    notionalSumMicros: 0n,
    pnlSumMicros: 0n,
    bins: Array.from({ length: BIN_COUNT }, (_, binIndex) => ({
      binIndex,
      sampleCount: 0,
      sumConfidenceBps: 0n,
      correctCount: 0,
    })),
    categories: [],
  };
}

function normalizeWallet(wallet: string) {
  return wallet.startsWith("0x") ? wallet.toLowerCase() : wallet;
}

export function memoryReputationStore(): ReputationStore {
  const opened = new Set<string>();
  const scores = new Map<string, PredictionScoreRow>();
  const reputations = new Map<string, ReputationSnapshot>();
  const jobs: ReputationJobRow[] = [];
  const markets = new Map<string, { outcome: ResolutionOutcome; resolvedAt: Date }>();
  let seq = 1;

  const ensure = (wallet: string) => {
    const key = normalizeWallet(wallet);
    const existing = reputations.get(key);
    if (existing) return existing;
    const created = emptySnapshot(wallet);
    reputations.set(key, created);
    return created;
  };

  return {
    async recordOpen(input) {
      if (opened.has(input.predictionId)) return false;
      opened.add(input.predictionId);
      const row = ensure(input.walletAddress);
      row.totalPredictions += 1;
      let category = row.categories.find((item) => item.category === input.category);
      if (!category) {
        category = {
          category: input.category,
          totalPredictions: 0,
          resolvedPredictions: 0,
          correctPredictions: 0,
          confidenceSumBps: 0n,
          brierSumMicros: 0n,
          notionalSumMicros: 0n,
          pnlSumMicros: 0n,
        };
        row.categories.push(category);
      }
      category.totalPredictions += 1;
      return true;
    },
    async hasScore(predictionId) {
      return scores.has(predictionId);
    },
    async saveScore(row) {
      scores.set(row.predictionId, row);
    },
    async applyResolution(score) {
      const row = ensure(score.walletAddress);
      row.resolvedPredictions += 1;
      if (score.correct) row.correctPredictions += 1;
      row.confidenceSumBps += BigInt(score.confidenceBps);
      row.brierSumMicros += score.brierMicros;
      if (score.notionalMicros > 0n) {
        row.notionalSumMicros += score.notionalMicros;
        row.pnlSumMicros += score.pnlMicros;
      }
      const bin = row.bins[Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(score.confidenceBps / 1000)))]!;
      bin.sampleCount += 1;
      bin.sumConfidenceBps += BigInt(score.confidenceBps);
      if (score.correct) bin.correctCount += 1;
      let category = row.categories.find((item) => item.category === score.category);
      if (!category) {
        category = {
          category: score.category,
          totalPredictions: 0,
          resolvedPredictions: 0,
          correctPredictions: 0,
          confidenceSumBps: 0n,
          brierSumMicros: 0n,
          notionalSumMicros: 0n,
          pnlSumMicros: 0n,
        };
        row.categories.push(category);
      }
      category.resolvedPredictions += 1;
      if (score.correct) category.correctPredictions += 1;
      category.confidenceSumBps += BigInt(score.confidenceBps);
      category.brierSumMicros += score.brierMicros;
      if (score.notionalMicros > 0n) {
        category.notionalSumMicros += score.notionalMicros;
        category.pnlSumMicros += score.pnlMicros;
      }
      scores.set(score.predictionId, score);
    },
    async getReputation(walletAddress) {
      return reputations.get(normalizeWallet(walletAddress)) ?? null;
    },
    async listScores(walletAddress) {
      const key = normalizeWallet(walletAddress);
      return [...scores.values()]
        .filter((row) => normalizeWallet(row.walletAddress) === key)
        .sort((a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime());
    },
    async enqueueJob(marketId, resolvedOutcome) {
      const existing = jobs.find((job) => job.marketId === marketId);
      if (existing) return existing;
      const job: ReputationJobRow = {
        id: `job_${seq++}`,
        marketId,
        resolvedOutcome,
        status: "QUEUED",
        errorMessage: null,
        createdAt: new Date(),
        processedAt: null,
      };
      jobs.push(job);
      return job;
    },
    async claimJob(at) {
      const now = (at ?? new Date()).getTime();
      const job = jobs.find(
        (item) => item.status === "QUEUED" && (!("availableAt" in item) || !item.availableAt || (item.availableAt as Date).getTime() <= now),
      );
      if (!job) return null;
      job.status = "PROCESSING";
      return job;
    },
    async requeueJob(id, input) {
      const job = jobs.find((item) => item.id === id) as (ReputationJobRow & { availableAt?: Date }) | undefined;
      if (!job) return;
      job.status = "QUEUED";
      job.errorMessage = input.errorMessage;
      job.availableAt = input.availableAt;
      if (input.countAttempt) job.attempts = (job.attempts ?? 0) + 1;
    },
    async finishJob(id, status, errorMessage) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return;
      job.status = status;
      job.errorMessage = errorMessage ?? null;
      job.processedAt = new Date();
    },
    async markMarketResolved(marketId, outcome, resolvedAt) {
      markets.set(marketId, { outcome, resolvedAt });
    },
  };
}

function toScore(row: {
  predictionId: string;
  walletAddress: string;
  marketId: string;
  category: string;
  predictedOutcome: string;
  resolvedOutcome: string;
  confidenceBps: number;
  impliedYesBps: number;
  correct: boolean;
  brierMicros: bigint;
  notionalMicros: bigint;
  payoutMicros: bigint;
  pnlMicros: bigint;
  resolvedAt: Date;
}): PredictionScoreRow {
  return {
    predictionId: row.predictionId,
    walletAddress: row.walletAddress,
    marketId: row.marketId,
    category: row.category,
    predictedOutcome: row.predictedOutcome as PredictionScoreRow["predictedOutcome"],
    resolvedOutcome: row.resolvedOutcome as PredictionScoreRow["resolvedOutcome"],
    confidenceBps: row.confidenceBps,
    impliedYesBps: row.impliedYesBps,
    correct: row.correct,
    brierMicros: row.brierMicros,
    notionalMicros: row.notionalMicros,
    payoutMicros: row.payoutMicros,
    pnlMicros: row.pnlMicros,
    resolvedAt: row.resolvedAt,
  };
}

/** One attempt at recording an open prediction. Throws P2002 on any collision. */
async function recordOpenOnce(
  prisma: PrismaClient,
  input: { predictionId: string; walletAddress: string; category: string },
): Promise<boolean> {
  await prisma.$transaction(async (tx) => {
    await tx.reputationOpen.create({
      data: {
        predictionId: input.predictionId,
        walletAddress: input.walletAddress,
        category: input.category,
      },
    });
    await tx.userReputation.upsert({
      where: { walletAddress: input.walletAddress },
      create: { walletAddress: input.walletAddress, totalPredictions: 1 },
      update: { totalPredictions: { increment: 1 } },
    });
    await tx.userReputationCategory.upsert({
      where: {
        walletAddress_category: { walletAddress: input.walletAddress, category: input.category },
      },
      create: { walletAddress: input.walletAddress, category: input.category, totalPredictions: 1 },
      update: { totalPredictions: { increment: 1 } },
    });
  });
  return true;
}

/** One attempt at applying a resolution. Throws P2002 on any collision. */
async function applyResolutionOnce(prisma: PrismaClient, score: PredictionScoreRow): Promise<void> {
    const already = await prisma.predictionScore.findUnique({
      where: { predictionId: score.predictionId },
    });
    if (already) return;
    await withUniqueRetry(() =>
      prisma.userReputation.upsert({
        where: { walletAddress: score.walletAddress },
        create: { walletAddress: score.walletAddress },
        update: {},
      }),
    );
    await prisma.$transaction(async (tx) => {
      // Unique predictionId: a concurrent worker that already scored this row makes
      // create() throw P2002, which rolls back the aggregate increments below.
      await tx.predictionScore.create({
        data: {
          predictionId: score.predictionId,
          walletAddress: score.walletAddress,
          marketId: score.marketId,
          category: score.category,
          predictedOutcome: score.predictedOutcome,
          resolvedOutcome: score.resolvedOutcome,
          confidenceBps: score.confidenceBps,
          impliedYesBps: score.impliedYesBps,
          correct: score.correct,
          brierMicros: score.brierMicros,
          notionalMicros: score.notionalMicros,
          payoutMicros: score.payoutMicros,
          pnlMicros: score.pnlMicros,
          resolvedAt: score.resolvedAt,
        },
      });
      await tx.userReputation.update({
        where: { walletAddress: score.walletAddress },
        data: {
          resolvedPredictions: { increment: 1 },
          correctPredictions: { increment: score.correct ? 1 : 0 },
          confidenceSumBps: { increment: BigInt(score.confidenceBps) },
          brierSumMicros: { increment: score.brierMicros },
          ...(score.notionalMicros > 0n
            ? {
                notionalSumMicros: { increment: score.notionalMicros },
                pnlSumMicros: { increment: score.pnlMicros },
              }
            : {}),
        },
      });
      await tx.userReputationCategory.upsert({
        where: {
          walletAddress_category: {
            walletAddress: score.walletAddress,
            category: score.category,
          },
        },
        create: {
          walletAddress: score.walletAddress,
          category: score.category,
          resolvedPredictions: 1,
          correctPredictions: score.correct ? 1 : 0,
          confidenceSumBps: BigInt(score.confidenceBps),
          brierSumMicros: score.brierMicros,
          notionalSumMicros: score.notionalMicros > 0n ? score.notionalMicros : 0n,
          pnlSumMicros: score.notionalMicros > 0n ? score.pnlMicros : 0n,
        },
        update: {
          resolvedPredictions: { increment: 1 },
          correctPredictions: { increment: score.correct ? 1 : 0 },
          confidenceSumBps: { increment: BigInt(score.confidenceBps) },
          brierSumMicros: { increment: score.brierMicros },
          ...(score.notionalMicros > 0n
            ? {
                notionalSumMicros: { increment: score.notionalMicros },
                pnlSumMicros: { increment: score.pnlMicros },
              }
            : {}),
        },
      });
      const binIndex = Math.min(9, Math.max(0, Math.floor(score.confidenceBps / 1000)));
      await tx.calibrationBin.upsert({
        where: {
          walletAddress_binIndex: { walletAddress: score.walletAddress, binIndex },
        },
        create: {
          walletAddress: score.walletAddress,
          binIndex,
          sampleCount: 1,
          sumConfidenceBps: BigInt(score.confidenceBps),
          correctCount: score.correct ? 1 : 0,
        },
        update: {
          sampleCount: { increment: 1 },
          sumConfidenceBps: { increment: BigInt(score.confidenceBps) },
          correctCount: { increment: score.correct ? 1 : 0 },
        },
      });
    });
}

export function prismaReputationStore(prisma: PrismaClient): ReputationStore {
  return {
    async recordOpen(input) {
      // A P2002 here means either this prediction was already recorded (idempotent,
      // return false) or two wallets/predictions raced on the shared UserReputation /
      // UserReputationCategory rows (PostgreSQL does not serialise concurrent upserts).
      // Only the first is a no-op; the second must retry or the totals undercount.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await recordOpenOnce(prisma, input);
        } catch (error) {
          if (!isUniqueViolation(error) || attempt >= 4) throw error;
          const existing = await prisma.reputationOpen.findUnique({
            where: { predictionId: input.predictionId },
            select: { predictionId: true },
          });
          if (existing) return false;
        }
      }
    },
    async hasScore(predictionId) {
      const row = await prisma.predictionScore.findUnique({ where: { predictionId } });
      return Boolean(row);
    },
    async saveScore(row) {
      // Concurrent scorers can create this parent row at the same time (P2002 on PG).
      await withUniqueRetry(() =>
        prisma.userReputation.upsert({
          where: { walletAddress: row.walletAddress },
          create: { walletAddress: row.walletAddress },
          update: {},
        }),
      );
      await prisma.predictionScore.create({
        data: {
          predictionId: row.predictionId,
          walletAddress: row.walletAddress,
          marketId: row.marketId,
          category: row.category,
          predictedOutcome: row.predictedOutcome,
          resolvedOutcome: row.resolvedOutcome,
          confidenceBps: row.confidenceBps,
          impliedYesBps: row.impliedYesBps,
          correct: row.correct,
          brierMicros: row.brierMicros,
          notionalMicros: row.notionalMicros,
          payoutMicros: row.payoutMicros,
          pnlMicros: row.pnlMicros,
          resolvedAt: row.resolvedAt,
        },
      });
    },
    async applyResolution(score) {
      // Retry on P2002: concurrent scoring for the same wallet collides on the shared
      // UserReputation / UserReputationCategory / CalibrationBin rows. A duplicate score
      // for this prediction is the other P2002 case and stays a no-op.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await applyResolutionOnce(prisma, score);
        } catch (error) {
          if (!isUniqueViolation(error) || attempt >= 4) throw error;
          const scored = await prisma.predictionScore.findUnique({
            where: { predictionId: score.predictionId },
            select: { predictionId: true },
          });
          if (scored) return;
        }
      }
    },
    async getReputation(walletAddress) {
      const row = await prisma.userReputation.findFirst({
        where: { walletAddress: { equals: walletAddress } },
        include: { categories: true, bins: { orderBy: { binIndex: "asc" } } },
      });
      if (!row) return null;
      return snapshotFromPrisma(row);
    },
    async listScores(walletAddress) {
      const rows = await prisma.predictionScore.findMany({
        where: { walletAddress },
        orderBy: { resolvedAt: "desc" },
      });
      return rows.map(toScore);
    },
    async enqueueJob(marketId, resolvedOutcome) {
      // Two resolvers can reach create() for the same market at once: PostgreSQL raises
      // P2002 rather than serialising them. The retry then finds the existing job and
      // takes the idempotent branch.
      const row = await withUniqueRetry(() =>
        prisma.$transaction(async (tx) => {
        const existing = await tx.reputationJob.findUnique({ where: { marketId } });
        if (existing && existing.resolvedOutcome !== resolvedOutcome) {
          throw new BettingError(
            "RESOLUTION_CONFLICT",
            `Market already resolving as ${existing.resolvedOutcome}.`,
            409,
          );
        }
        const job = existing
          ? existing.status === "FAILED"
            ? await tx.reputationJob.update({
                where: { id: existing.id },
                data: { status: "QUEUED", errorMessage: null, claimedAt: null, attempts: 0, availableAt: null },
              })
            : existing
          : await tx.reputationJob.create({ data: { marketId, resolvedOutcome, status: "QUEUED" } });
        // Close the market in the same transaction so no prediction can land after the cutoff.
        await tx.market.updateMany({
          where: { id: marketId, resolvedAt: null },
          data: { status: "resolved", resolvedOutcome, resolvedAt: job.createdAt, accepting: false },
        });
          return job;
        }),
      );
      return {
        id: row.id,
        marketId: row.marketId,
        resolvedOutcome: row.resolvedOutcome as ReputationJobRow["resolvedOutcome"],
        status: row.status as ReputationJobRow["status"],
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        processedAt: row.processedAt,
      };
    },
    async claimJob(at) {
      const now = at ?? new Date();
      const staleBefore = new Date(now.getTime() - JOB_LEASE_MS);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = await prisma.reputationJob.findFirst({
          where: {
            OR: [
              { status: "QUEUED", OR: [{ availableAt: null }, { availableAt: { lte: now } }] },
              { status: "PROCESSING", claimedAt: { lt: staleBefore } },
            ],
          },
          orderBy: { createdAt: "asc" },
        });
        if (!candidate) return null;
        const updated = await prisma.reputationJob.updateMany({
          where: { id: candidate.id, status: candidate.status, claimedAt: candidate.claimedAt },
          data: { status: "PROCESSING", claimedAt: now },
        });
        // Lost the race to another worker: look for the next job instead of stopping.
        if (updated.count !== 1) continue;
        return {
          id: candidate.id,
          marketId: candidate.marketId,
          resolvedOutcome: candidate.resolvedOutcome as ReputationJobRow["resolvedOutcome"],
          status: "PROCESSING" as const,
          attempts: candidate.attempts,
          errorMessage: null,
          createdAt: candidate.createdAt,
          processedAt: null,
        };
      }
      return null;
    },
    async requeueJob(id, input) {
      await prisma.reputationJob.update({
        where: { id },
        data: {
          status: "QUEUED",
          errorMessage: input.errorMessage,
          availableAt: input.availableAt,
          claimedAt: null,
          ...(input.countAttempt ? { attempts: { increment: 1 } } : {}),
        },
      });
    },
    async finishJob(id, status, errorMessage) {
      await prisma.reputationJob.update({
        where: { id },
        data: { status, errorMessage: errorMessage ?? null, processedAt: new Date() },
      });
    },
    async markMarketResolved(marketId, outcome, resolvedAt) {
      await prisma.market.updateMany({
        where: { id: marketId, resolvedAt: null },
        data: { status: "resolved", resolvedOutcome: outcome, resolvedAt, accepting: false },
      });
    },
  };
}

function snapshotFromPrisma(row: {
  walletAddress: string;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  confidenceSumBps: bigint;
  brierSumMicros: bigint;
  notionalSumMicros: bigint;
  pnlSumMicros: bigint;
  bins: Array<{
    binIndex: number;
    sampleCount: number;
    sumConfidenceBps: bigint;
    correctCount: number;
  }>;
  categories: Array<{
    category: string;
    totalPredictions: number;
    resolvedPredictions: number;
    correctPredictions: number;
    confidenceSumBps: bigint;
    brierSumMicros: bigint;
    notionalSumMicros: bigint;
    pnlSumMicros: bigint;
  }>;
}): ReputationSnapshot {
  const bins = Array.from({ length: BIN_COUNT }, (_, binIndex) => {
    const found = row.bins.find((item) => item.binIndex === binIndex);
    return {
      binIndex,
      sampleCount: found?.sampleCount ?? 0,
      sumConfidenceBps: found?.sumConfidenceBps ?? 0n,
      correctCount: found?.correctCount ?? 0,
    };
  });
  return {
    walletAddress: row.walletAddress,
    totalPredictions: row.totalPredictions,
    resolvedPredictions: row.resolvedPredictions,
    correctPredictions: row.correctPredictions,
    confidenceSumBps: row.confidenceSumBps,
    brierSumMicros: row.brierSumMicros,
    notionalSumMicros: row.notionalSumMicros,
    pnlSumMicros: row.pnlSumMicros,
    bins,
    categories: row.categories,
  };
}

/** A PROCESSING job untouched for this long is assumed to belong to a crashed worker. */
const JOB_LEASE_MS = 10 * 60 * 1000;
