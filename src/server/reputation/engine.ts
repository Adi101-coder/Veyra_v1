import type { Outcome } from "@/lib/betting";
import { BettingError } from "@/server/errors";
import {
  accuracyRatio,
  averageConfidencePct,
  binRange,
  expectedCalibrationError,
  meanBrier,
  ratio,
  REPUTATION_DOCUMENTATION,
  scoreForecast,
} from "@/server/reputation/metrics";
import type { Forecast, ForecastSource, ReputationStore } from "@/server/reputation/types";

export class ReputationEngine {
  constructor(
    private readonly store: ReputationStore,
    private readonly source: ForecastSource,
  ) {}

  async recordOpen(input: { predictionId: string; walletAddress: string; category: string }) {
    return this.store.recordOpen(input);
  }

  async enqueueResolution(marketId: string, resolvedOutcome: Outcome) {
    if (resolvedOutcome !== "YES" && resolvedOutcome !== "NO") {
      throw new BettingError("INVALID_OUTCOME", "Resolved outcome must be YES or NO.");
    }
    return this.store.enqueueJob(marketId, resolvedOutcome);
  }

  async processJobs() {
    const processed = [];
    for (;;) {
      const job = await this.store.claimJob();
      if (!job) break;
      try {
        const count = await this.resolveMarket(job.marketId, job.resolvedOutcome);
        await this.store.finishJob(job.id, "DONE");
        processed.push({ jobId: job.id, marketId: job.marketId, scored: count });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reputation job failed";
        await this.store.finishJob(job.id, "FAILED", message);
        processed.push({ jobId: job.id, marketId: job.marketId, scored: 0, error: message });
      }
    }
    return processed;
  }

  async resolveNow(marketId: string, resolvedOutcome: Outcome) {
    const job = await this.enqueueResolution(marketId, resolvedOutcome);
    if (job.status === "DONE") {
      return { jobId: job.id, marketId, scored: 0, already: true };
    }
    const results = await this.processJobs();
    return results.find((item) => item.jobId === job.id) ?? results[0] ?? { jobId: job.id, marketId, scored: 0 };
  }

  async getReputation(walletAddress: string) {
    const snapshot = await this.store.getReputation(walletAddress);
    if (!snapshot) {
      return {
        walletAddress,
        totalPredictions: 0,
        resolvedPredictions: 0,
        correctPredictions: 0,
        accuracy: null,
        averageConfidencePct: null,
        brierScore: null,
        calibration: { ece: null, bins: [] as ReturnType<typeof toBinDto>[] },
        roi: null,
        categories: [] as ReturnType<typeof toCategoryDto>[],
        documentation: REPUTATION_DOCUMENTATION,
      };
    }
    return {
      walletAddress: snapshot.walletAddress,
      totalPredictions: snapshot.totalPredictions,
      resolvedPredictions: snapshot.resolvedPredictions,
      correctPredictions: snapshot.correctPredictions,
      accuracy: accuracyRatio(snapshot.correctPredictions, snapshot.resolvedPredictions),
      averageConfidencePct: averageConfidencePct(
        snapshot.confidenceSumBps,
        snapshot.resolvedPredictions,
      ),
      brierScore: meanBrier(snapshot.brierSumMicros, snapshot.resolvedPredictions),
      calibration: {
        ece: expectedCalibrationError(snapshot.bins, snapshot.resolvedPredictions),
        bins: snapshot.bins.filter((bin) => bin.sampleCount > 0).map(toBinDto),
      },
      roi: ratio(snapshot.pnlSumMicros, snapshot.notionalSumMicros),
      categories: snapshot.categories.map(toCategoryDto),
      documentation: REPUTATION_DOCUMENTATION,
    };
  }

  async listScores(walletAddress: string) {
    return this.store.listScores(walletAddress);
  }

  private async resolveMarket(marketId: string, resolvedOutcome: Outcome) {
    const forecasts = await this.source.listByMarket(marketId);
    const resolvedAt = new Date();
    await this.store.markMarketResolved(marketId, resolvedOutcome, resolvedAt);
    let scored = 0;
    for (const forecast of forecasts) {
      if (await this.store.hasScore(forecast.predictionId)) continue;
      const scoredRow = scoreForecast({
        predictedOutcome: forecast.predictedOutcome,
        resolvedOutcome,
        confidenceBps: forecast.confidenceBps,
        notionalMicros: forecast.notionalMicros,
        payoutMicros: forecast.payoutMicros,
      });
      await this.store.applyResolution({
        predictionId: forecast.predictionId,
        walletAddress: forecast.walletAddress,
        marketId: forecast.marketId,
        category: forecast.category,
        predictedOutcome: forecast.predictedOutcome,
        resolvedOutcome,
        confidenceBps: forecast.confidenceBps,
        impliedYesBps: scoredRow.impliedYesBps,
        correct: scoredRow.correct,
        brierMicros: scoredRow.brierMicros,
        notionalMicros: forecast.notionalMicros,
        payoutMicros: forecast.payoutMicros,
        pnlMicros: scoredRow.pnlMicros,
        resolvedAt,
      });
      scored += 1;
    }
    return scored;
  }
}

function toBinDto(bin: {
  binIndex: number;
  sampleCount: number;
  sumConfidenceBps: bigint;
  correctCount: number;
}) {
  const range = binRange(bin.binIndex);
  const meanConfidencePct = bin.sampleCount
    ? Number(bin.sumConfidenceBps) / bin.sampleCount / 100
    : 0;
  return {
    bin: `${range.minPct}-${range.maxPct}`,
    sampleCount: bin.sampleCount,
    meanConfidencePct,
    empiricalAccuracy: bin.sampleCount ? bin.correctCount / bin.sampleCount : 0,
  };
}

function toCategoryDto(row: {
  category: string;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  confidenceSumBps: bigint;
  brierSumMicros: bigint;
  notionalSumMicros: bigint;
  pnlSumMicros: bigint;
}) {
  return {
    category: row.category,
    totalPredictions: row.totalPredictions,
    resolvedPredictions: row.resolvedPredictions,
    correctPredictions: row.correctPredictions,
    accuracy: accuracyRatio(row.correctPredictions, row.resolvedPredictions),
    averageConfidencePct: averageConfidencePct(row.confidenceSumBps, row.resolvedPredictions),
    brierScore: meanBrier(row.brierSumMicros, row.resolvedPredictions),
    roi: ratio(row.pnlSumMicros, row.notionalSumMicros),
  };
}

export function forecastsFromRows(rows: Forecast[]): ForecastSource {
  return {
    async listByMarket(marketId) {
      return rows.filter((row) => row.marketId === marketId);
    },
  };
}
