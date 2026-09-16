import type { Outcome } from "@/lib/betting";
import type { PrismaClient } from "@prisma/client";
import { BIN_COUNT } from "@/server/reputation/metrics";
import type {
  PredictionScoreRow,
  ReputationJobRow,
  ReputationSnapshot,
  ReputationStore,
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
  const markets = new Map<string, { outcome: Outcome; resolvedAt: Date }>();
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
    async claimJob() {
      const job = jobs.find((item) => item.status === "QUEUED");
      if (!job) return null;
      job.status = "PROCESSING";
      return job;
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

export function prismaReputationStore(prisma: PrismaClient): ReputationStore {
  return {
    async recordOpen(input) {
      try {
        await prisma.reputationOpen.create({
          data: {
            predictionId: input.predictionId,
            walletAddress: input.walletAddress,
            category: input.category,
          },
        });
      } catch {
        return false;
      }
      await prisma.userReputation.upsert({
        where: { walletAddress: input.walletAddress },
        create: { walletAddress: input.walletAddress, totalPredictions: 1 },
        update: { totalPredictions: { increment: 1 } },
      });
      await prisma.userReputationCategory.upsert({
        where: {
          walletAddress_category: { walletAddress: input.walletAddress, category: input.category },
        },
        create: {
          walletAddress: input.walletAddress,
          category: input.category,
          totalPredictions: 1,
        },
        update: { totalPredictions: { increment: 1 } },
      });
      return true;
    },
    async hasScore(predictionId) {
      const row = await prisma.predictionScore.findUnique({ where: { predictionId } });
      return Boolean(row);
    },
    async saveScore(row) {
      await prisma.userReputation.upsert({
        where: { walletAddress: row.walletAddress },
        create: { walletAddress: row.walletAddress },
        update: {},
      });
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
      const already = await prisma.predictionScore.findUnique({
        where: { predictionId: score.predictionId },
      });
      if (already) return;
      await prisma.userReputation.upsert({
        where: { walletAddress: score.walletAddress },
        create: { walletAddress: score.walletAddress },
        update: {},
      });
      await prisma.$transaction(async (tx) => {
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
    },
    async getReputation(walletAddress) {
      const row = await prisma.userReputation.findFirst({
        where: { walletAddress: { equals: walletAddress } },
        include: { categories: true, bins: { orderBy: { binIndex: "asc" } } },
      });
      if (!row) {
        const all = await prisma.userReputation.findMany({ include: { categories: true, bins: true } });
        const match = all.find(
          (item) =>
            item.walletAddress === walletAddress ||
            (item.walletAddress.startsWith("0x") &&
              walletAddress.startsWith("0x") &&
              item.walletAddress.toLowerCase() === walletAddress.toLowerCase()),
        );
        if (!match) return null;
        return snapshotFromPrisma(match);
      }
      return snapshotFromPrisma(row);
    },
    async listScores(walletAddress) {
      const rows = await prisma.predictionScore.findMany({
        where: { walletAddress },
        orderBy: { resolvedAt: "desc" },
      });
      if (rows.length) return rows.map(toScore);
      const all = await prisma.predictionScore.findMany({ orderBy: { resolvedAt: "desc" } });
      return all
        .filter(
          (row) =>
            row.walletAddress === walletAddress ||
            (row.walletAddress.startsWith("0x") &&
              walletAddress.startsWith("0x") &&
              row.walletAddress.toLowerCase() === walletAddress.toLowerCase()),
        )
        .map(toScore);
    },
    async enqueueJob(marketId, resolvedOutcome) {
      const existing = await prisma.reputationJob.findUnique({ where: { marketId } });
      if (existing) {
        return {
          id: existing.id,
          marketId: existing.marketId,
          resolvedOutcome: existing.resolvedOutcome as Outcome,
          status: existing.status as ReputationJobRow["status"],
          errorMessage: existing.errorMessage,
          createdAt: existing.createdAt,
          processedAt: existing.processedAt,
        };
      }
      const created = await prisma.reputationJob.create({
        data: { marketId, resolvedOutcome, status: "QUEUED" },
      });
      return {
        id: created.id,
        marketId: created.marketId,
        resolvedOutcome: created.resolvedOutcome as Outcome,
        status: "QUEUED",
        errorMessage: null,
        createdAt: created.createdAt,
        processedAt: null,
      };
    },
    async claimJob() {
      const queued = await prisma.reputationJob.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });
      if (!queued) return null;
      const updated = await prisma.reputationJob.updateMany({
        where: { id: queued.id, status: "QUEUED" },
        data: { status: "PROCESSING" },
      });
      if (updated.count !== 1) return null;
      return {
        id: queued.id,
        marketId: queued.marketId,
        resolvedOutcome: queued.resolvedOutcome as Outcome,
        status: "PROCESSING",
        errorMessage: null,
        createdAt: queued.createdAt,
        processedAt: null,
      };
    },
    async finishJob(id, status, errorMessage) {
      await prisma.reputationJob.update({
        where: { id },
        data: { status, errorMessage: errorMessage ?? null, processedAt: new Date() },
      });
    },
    async markMarketResolved(marketId, outcome, resolvedAt) {
      await prisma.market.updateMany({
        where: { id: marketId },
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
