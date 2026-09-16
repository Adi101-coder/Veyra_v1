import type { ConvictionEngineConfig } from "@/server/conviction/config";
import {
  bpsToTenthPct,
  capitalUsd,
  computeConviction,
  CONVICTION_DOCUMENTATION,
  shouldPersistSnapshot,
  trailFromSnapshots,
} from "@/server/conviction/formula";
import type {
  ConvictionDTO,
  ConvictionInternals,
  ConvictionSnapshotRow,
  ConvictionStore,
  ConvictionVote,
} from "@/server/conviction/types";

export class ConvictionEngine {
  constructor(
    private readonly config: ConvictionEngineConfig,
    private readonly store: ConvictionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  compute(input: {
    marketId: string;
    votes: ConvictionVote[];
    polymarketProbabilityBps: number;
  }): ConvictionInternals {
    return computeConviction({
      marketId: input.marketId,
      votes: input.votes,
      polymarketProbabilityBps: input.polymarketProbabilityBps,
      config: this.config,
    });
  }

  async measure(
    marketId: string,
    polymarketProbabilityBps: number,
    options: { persist?: "auto" | "always" | "never" } = {},
  ): Promise<ConvictionDTO> {
    const votes = await this.store.listVotes(marketId);
    const internals = this.compute({ marketId, votes, polymarketProbabilityBps });
    const persist = options.persist ?? "auto";
    const previous = await this.store.latestSnapshot(marketId);
    const now = this.now();
    let snapshotAt = previous?.createdAt ?? null;

    if (
      persist === "always" ||
      (persist === "auto" &&
        shouldPersistSnapshot({
          previous,
          nextConvictionBps: internals.convictionBps,
          now,
          intervalMs: this.config.snapshotIntervalMs,
          minDeltaBps: this.config.snapshotMinDeltaBps,
        }))
    ) {
      const saved = await this.store.insertSnapshot({
        marketId,
        engineVersion: this.config.version,
        participants: internals.participants,
        capitalMicros: internals.capitalMicros,
        averageConfidenceBps: internals.averageConfidenceBps,
        capitalWeightedConfidenceBps: internals.capitalWeightedConfidenceBps,
        convictionBps: internals.convictionBps,
        polymarketProbabilityBps: internals.polymarketProbabilityBps,
        divergenceBps: internals.divergenceBps,
        distributionJson: JSON.stringify(internals.distribution),
        createdAt: now,
      });
      snapshotAt = saved.createdAt;
    }

    const snapshots = await this.store.listSnapshots(marketId, this.config.trailLength);
    return this.toDTO(internals, snapshots, snapshotAt);
  }

  toDTO(
    internals: ConvictionInternals,
    snapshots: ConvictionSnapshotRow[],
    snapshotAt: Date | null,
  ): ConvictionDTO {
    return {
      marketId: internals.marketId,
      participants: internals.participants,
      capitalCommitted: capitalUsd(internals.capitalMicros),
      averageConfidence: bpsToTenthPct(internals.averageConfidenceBps),
      capitalWeightedConfidence: bpsToTenthPct(internals.capitalWeightedConfidenceBps),
      conviction: bpsToTenthPct(internals.convictionBps),
      polymarketProbability: bpsToTenthPct(internals.polymarketProbabilityBps) ?? 0,
      divergence: bpsToTenthPct(internals.divergenceBps),
      trail: trailFromSnapshots(snapshots, internals.convictionBps, this.config.trailLength),
      outcomes: internals.outcomes,
      distribution: internals.distribution,
      methodology: {
        version: this.config.version,
        capitalBlendBps: this.config.capitalBlendBps,
        summary: CONVICTION_DOCUMENTATION.conviction,
      },
      snapshotAt: snapshotAt?.toISOString() ?? null,
    };
  }
}
