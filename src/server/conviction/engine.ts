import type { ConvictionEngineConfig } from "@/server/conviction/config";
import {
  bpsToPct,
  computeConviction,
  CONVICTION_DOCUMENTATION,
  METHODOLOGY_VERSION,
  microsToUsd,
  snapshotBucket,
  trailFromSnapshots,
} from "@/server/conviction/formula";
import type {
  ConvictionDTO,
  ConvictionInternals,
  ConvictionStore,
  PolymarketReference,
} from "@/server/conviction/types";

export class ConvictionEngine {
  constructor(
    private readonly config: ConvictionEngineConfig,
    private readonly store: ConvictionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Measures conviction from persisted filled positions. `polymarket` is the live
   * YES midpoint (or unavailable); after resolution the resolved YES price is used.
   */
  async measure(
    marketId: string,
    polymarket: PolymarketReference,
    options: { persist?: "auto" | "never" } = {},
  ): Promise<ConvictionDTO> {
    const [positions, resolution] = await Promise.all([
      this.store.listPositions(marketId),
      this.store.getResolution(marketId),
    ]);
    const reference: PolymarketReference = resolution
      ? resolution.outcome === "YES"
        ? { probabilityBps: 10_000, source: "resolved" }
        : resolution.outcome === "NO"
          ? { probabilityBps: 0, source: "resolved" }
          : { probabilityBps: null, source: "unavailable" }
      : polymarket;
    const internals = computeConviction({
      marketId,
      positions,
      polymarket: reference,
      capitalBlendBps: this.config.capitalBlendBps,
      binCount: this.config.binCount,
    });

    const asOf = this.now();
    let snapshotAt: Date | null = null;
    if (options.persist !== "never" && internals.participants > 0) {
      const bucketStart = snapshotBucket(asOf, this.config.snapshotIntervalMs);
      const row = await this.store.upsertSnapshot({
        marketId,
        engineVersion: `${METHODOLOGY_VERSION}/${this.config.version}`,
        participants: internals.participants,
        capitalMicros: internals.capitalMicros,
        averageConfidenceBps: internals.averageConfidenceBps,
        capitalWeightedConfidenceBps: internals.capitalWeightedConfidenceBps,
        convictionBps: internals.convictionBps,
        polymarketProbabilityBps: internals.polymarket.probabilityBps,
        divergenceBps: internals.divergenceBps,
        distributionJson: JSON.stringify(internals.distribution),
        inputsHash: internals.inputsHash,
        bucketStart,
      });
      snapshotAt = row.createdAt;
    }
    const history = await this.store.listSnapshots(marketId, this.config.trailLength);
    return this.toDTO(internals, {
      trailBps: history.map((row) => row.convictionBps),
      asOf,
      snapshotAt,
      resolution: resolution ? { outcome: resolution.outcome, resolvedAt: resolution.resolvedAt.toISOString() } : null,
    });
  }

  toDTO(
    internals: ConvictionInternals,
    extra: { trailBps: (number | null)[]; asOf: Date; snapshotAt: Date | null; resolution: ConvictionDTO["resolution"] },
  ): ConvictionDTO {
    return {
      marketId: internals.marketId,
      participants: internals.participants,
      totalCapitalUsd: microsToUsd(internals.capitalMicros),
      capitalMicros: internals.capitalMicros.toString(),
      capitalCommitted: Number(internals.capitalMicros) / 1_000_000,
      averageConfidence: bpsToPct(internals.averageConfidenceBps),
      capitalWeightedConfidence: bpsToPct(internals.capitalWeightedConfidenceBps),
      conviction: bpsToPct(internals.convictionBps),
      averageConfidenceBps: internals.averageConfidenceBps,
      capitalWeightedConfidenceBps: internals.capitalWeightedConfidenceBps,
      convictionBps: internals.convictionBps,
      polymarketProbability: bpsToPct(internals.polymarket.probabilityBps),
      polymarketProbabilityBps: internals.polymarket.probabilityBps,
      polymarketSource: internals.polymarket.source,
      divergence: bpsToPct(internals.divergenceBps),
      divergenceBps: internals.divergenceBps,
      trail: trailFromSnapshots(extra.trailBps, internals.convictionBps, this.config.trailLength),
      outcomes: internals.outcomes,
      distribution: internals.distribution,
      resolution: extra.resolution,
      methodology: {
        version: METHODOLOGY_VERSION,
        capitalBlendBps: this.config.capitalBlendBps,
        summary: CONVICTION_DOCUMENTATION.conviction,
        definitions: CONVICTION_DOCUMENTATION,
      },
      inputsHash: internals.inputsHash,
      asOf: extra.asOf.toISOString(),
      snapshotAt: extra.snapshotAt?.toISOString() ?? null,
    };
  }
}
