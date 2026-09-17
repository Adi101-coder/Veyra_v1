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
import type { Forecast, ForecastSource, ReputationStore, ResolutionOutcome } from "@/server/reputation/types";

export class ReputationEngine {
  constructor(
    private readonly store: ReputationStore,
    private readonly source: ForecastSource,
    private readonly options: { maxDeferMs?: number; retryDelayMs?: number; maxAttempts?: number; now?: () => number } = {},
  ) {}

  async recordOpen(input: { predictionId: string; walletAddress: string; category: string }) {
    return this.store.recordOpen(input);
  }

  async enqueueResolution(marketId: string, resolvedOutcome: ResolutionOutcome) {
    if (resolvedOutcome !== "YES" && resolvedOutcome !== "NO" && resolvedOutcome !== "INVALID") {
      throw new BettingError("INVALID_OUTCOME", "Resolved outcome must be YES, NO or INVALID.");
    }
    const job = await this.store.enqueueJob(marketId, resolvedOutcome);
    await this.store.markMarketResolved(marketId, resolvedOutcome, job.createdAt);
    return job;
  }

  async processJobs() {
    const processed = [];
    const requeuedThisPass = new Set<string>();
    for (;;) {
      const now = this.options.now?.() ?? Date.now();
      // claimJob skips rows another worker won and reclaims stale PROCESSING rows.
      const job = await this.store.claimJob(new Date(now));
      if (!job) break;
      if (requeuedThisPass.has(job.id)) {
        // Never spin on a job this pass already deferred or retried.
        await this.store.requeueJob(job.id, { errorMessage: job.errorMessage ?? "Deferred", availableAt: new Date(now + (this.options.retryDelayMs ?? 60_000)), countAttempt: false });
        break;
      }
      const retryDelay = this.options.retryDelayMs ?? 60_000;
      try {
        if (job.resolvedOutcome !== "INVALID") {
          // Pre-cutoff orders whose fills are not reconciled yet would be scored with
          // incomplete cost/shares (or skipped entirely). Wait for them, bounded.
          const pending = (await this.source.pendingExecutions?.(job.marketId, job.createdAt)) ?? 0;
          const maxDefer = this.options.maxDeferMs ?? 24 * 60 * 60 * 1000;
          if (pending > 0 && now - job.createdAt.getTime() < maxDefer) {
            await this.store.requeueJob(job.id, {
              errorMessage: `Waiting for ${pending} execution(s) to reconcile before scoring.`,
              availableAt: new Date(now + retryDelay),
              countAttempt: false,
            });
            requeuedThisPass.add(job.id);
            processed.push({ jobId: job.id, marketId: job.marketId, scored: 0, deferred: true });
            continue;
          }
        }
        const count =
          job.resolvedOutcome === "INVALID" ? 0 : await this.resolveMarket(job.marketId, job.resolvedOutcome, job.createdAt);
        await this.store.finishJob(job.id, "DONE");
        processed.push({ jobId: job.id, marketId: job.marketId, scored: count });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reputation job failed";
        const attempts = (job.attempts ?? 0) + 1;
        if (attempts >= (this.options.maxAttempts ?? 5)) {
          await this.store.finishJob(job.id, "FAILED", message);
        } else {
          // Scores already written are idempotent, so a retry only fills the gaps.
          await this.store.requeueJob(job.id, {
            errorMessage: message,
            availableAt: new Date(now + retryDelay * 2 ** (attempts - 1)),
            countAttempt: true,
          });
          requeuedThisPass.add(job.id);
        }
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

  private async resolveMarket(marketId: string, resolvedOutcome: Outcome, resolvedAt: Date) {
    // The market was marked resolved when the job was enqueued, so nothing can be
    // placed after this cutoff; scoring is limited to predictions made before it.
    const forecasts = await this.source.listByMarket(marketId, resolvedAt);
    let scored = 0;
    for (const forecast of forecasts) {
      if (await this.store.hasScore(forecast.predictionId)) continue;
      const scoredRow = scoreForecast({
        predictedOutcome: forecast.predictedOutcome,
        resolvedOutcome,
        confidenceBps: forecast.confidenceBps,
        notionalMicros: forecast.notionalMicros,
        payoutMicros: forecast.payoutMicros,
        proceedsMicros: forecast.proceedsMicros,
      });
      try {
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
      } catch (error) {
        // Already scored by a concurrent worker (unique predictionId): not an error.
        if ((error as { code?: string })?.code === "P2002") continue;
        throw error;
      }
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
