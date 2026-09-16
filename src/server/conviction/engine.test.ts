import { describe, expect, it } from "vitest";
import {
  blendConvictionBps,
  capitalWeightedBps,
  collapseParticipants,
  computeConviction,
  divergenceBps,
  impliedYesBps,
  meanBps,
  shouldPersistSnapshot,
  trailFromSnapshots,
} from "@/server/conviction/formula";
import { defaultConvictionEngineConfig } from "@/server/conviction/config";
import { ConvictionEngine } from "@/server/conviction/engine";
import { memoryConvictionStore } from "@/server/conviction/store";
import type { ConvictionVote } from "@/server/conviction/types";

const MARKET = "btc-120k";
const POLYMARKET = 6300;

function vote(
  partial: Partial<ConvictionVote> & Pick<ConvictionVote, "predictionId" | "walletAddress" | "confidenceBps">,
): ConvictionVote {
  return {
    marketId: MARKET,
    outcome: "YES",
    capitalMicros: 1_000_000n,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    status: "accepted",
    ...partial,
  };
}

function wallet(n: number) {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

describe("ConvictionEngine methodology", () => {
  it("returns empty nulls when a market has no predictions", () => {
    const result = computeConviction({
      marketId: MARKET,
      votes: [],
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(result.participants).toBe(0);
    expect(result.capitalMicros).toBe(0n);
    expect(result.averageConfidenceBps).toBeNull();
    expect(result.capitalWeightedConfidenceBps).toBeNull();
    expect(result.convictionBps).toBeNull();
    expect(result.divergenceBps).toBeNull();
    expect(result.polymarketProbabilityBps).toBe(POLYMARKET);
    expect(result.outcomes.YES.participants).toBe(0);
    expect(result.outcomes.NO.participants).toBe(0);
  });

  it("ignores failed predictions", () => {
    const result = computeConviction({
      marketId: MARKET,
      votes: [
        vote({ predictionId: "ok", walletAddress: wallet(1), confidenceBps: 8000 }),
        vote({
          predictionId: "nope",
          walletAddress: wallet(2),
          confidenceBps: 9900,
          status: "failed",
          capitalMicros: 9_000_000_000n,
        }),
      ],
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(result.participants).toBe(1);
    expect(result.averageConfidenceBps).toBe(8000);
  });

  it("keeps conviction stable as participant count grows when every vote is identical", () => {
    const one = computeConviction({
      marketId: MARKET,
      votes: [vote({ predictionId: "only", walletAddress: wallet(1), confidenceBps: 8000 })],
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    const many = computeConviction({
      marketId: MARKET,
      votes: Array.from({ length: 50 }, (_, index) =>
        vote({
          predictionId: `p${index}`,
          walletAddress: wallet(index + 1),
          confidenceBps: 8000,
        }),
      ),
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(one.participants).toBe(1);
    expect(many.participants).toBe(50);
    expect(many.convictionBps).toBe(one.convictionBps);
    expect(many.averageConfidenceBps).toBe(8000);
  });

  it("treats equal stakes as an unweighted mean", () => {
    const votes = [60, 70, 80, 90].map((pct, index) =>
      vote({
        predictionId: `p${index}`,
        walletAddress: wallet(index + 1),
        confidenceBps: pct * 100,
        capitalMicros: 10_000_000n,
      }),
    );
    const result = computeConviction({
      marketId: MARKET,
      votes,
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(result.participants).toBe(4);
    expect(result.averageConfidenceBps).toBe(7500);
    expect(result.capitalWeightedConfidenceBps).toBe(7500);
    expect(result.convictionBps).toBe(7500);
  });

  it("lets a whale pull capital-weighted confidence without changing the equal-weight mean the same way", () => {
    const crowd = Array.from({ length: 10 }, (_, index) =>
      vote({
        predictionId: `crowd-${index}`,
        walletAddress: wallet(index + 1),
        confidenceBps: 6000,
        capitalMicros: 1_000_000n,
      }),
    );
    const whale = vote({
      predictionId: "whale",
      walletAddress: wallet(99),
      confidenceBps: 9000,
      capitalMicros: 1_000_000_000n,
    });
    const result = computeConviction({
      marketId: MARKET,
      votes: [...crowd, whale],
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(result.participants).toBe(11);
    expect(result.averageConfidenceBps).toBe(Math.round((6000 * 10 + 9000) / 11));
    expect(result.capitalWeightedConfidenceBps).toBeGreaterThan(result.averageConfidenceBps ?? 0);
    expect(result.capitalWeightedConfidenceBps).toBeGreaterThan(8900);
    expect(result.convictionBps).toBe(
      blendConvictionBps(
        result.averageConfidenceBps,
        result.capitalWeightedConfidenceBps,
        defaultConvictionEngineConfig.capitalBlendBps,
      ),
    );
  });

  it("maps NO confidence into implied P(YES) so conviction is comparable to Polymarket", () => {
    expect(impliedYesBps("YES", 8000)).toBe(8000);
    expect(impliedYesBps("NO", 8000)).toBe(2000);
    const result = computeConviction({
      marketId: MARKET,
      votes: [
        vote({ predictionId: "y", walletAddress: wallet(1), outcome: "YES", confidenceBps: 8000 }),
        vote({ predictionId: "n", walletAddress: wallet(2), outcome: "NO", confidenceBps: 8000 }),
      ],
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    expect(result.averageConfidenceBps).toBe(5000);
    expect(result.outcomes.YES.averageConfidence).toBe(80);
    expect(result.outcomes.NO.averageConfidence).toBe(80);
    expect(result.outcomes.YES.participants).toBe(1);
    expect(result.outcomes.NO.participants).toBe(1);
  });

  it("records a skewed confidence distribution in bins", () => {
    const votes = [
      ...Array.from({ length: 8 }, (_, index) =>
        vote({
          predictionId: `high-${index}`,
          walletAddress: wallet(index + 1),
          confidenceBps: 9200,
        }),
      ),
      vote({ predictionId: "low", walletAddress: wallet(20), confidenceBps: 1500, outcome: "YES" }),
    ];
    const result = computeConviction({
      marketId: MARKET,
      votes,
      polymarketProbabilityBps: POLYMARKET,
      config: defaultConvictionEngineConfig,
    });
    const high = result.distribution.find((bin) => bin.minPct === 90);
    const low = result.distribution.find((bin) => bin.minPct === 10);
    expect(high?.participants).toBe(8);
    expect(low?.participants).toBe(1);
  });

  it("blends 71.8 average and 74.2 weighted into 73.1 at the default 55% capital weight", () => {
    const conviction = blendConvictionBps(7180, 7420, 5500);
    expect(conviction).toBe(7312);
  });

  it("moves headline conviction when only the blend weight changes", () => {
    const votes = [
      vote({ predictionId: "a", walletAddress: wallet(1), confidenceBps: 5000, capitalMicros: 1_000_000n }),
      vote({ predictionId: "b", walletAddress: wallet(2), confidenceBps: 9000, capitalMicros: 9_000_000n }),
    ];
    const equal = computeConviction({
      marketId: MARKET,
      votes,
      polymarketProbabilityBps: POLYMARKET,
      config: { ...defaultConvictionEngineConfig, capitalBlendBps: 0 },
    });
    const capital = computeConviction({
      marketId: MARKET,
      votes,
      polymarketProbabilityBps: POLYMARKET,
      config: { ...defaultConvictionEngineConfig, capitalBlendBps: 10_000 },
    });
    expect(equal.convictionBps).toBe(equal.averageConfidenceBps);
    expect(capital.convictionBps).toBe(capital.capitalWeightedConfidenceBps);
    expect(capital.convictionBps).not.toBe(equal.convictionBps);
  });

  it("computes signed divergence against Polymarket", () => {
    expect(divergenceBps(7400, 6300)).toBe(1100);
    expect(divergenceBps(5000, 6300)).toBe(-1300);
    expect(divergenceBps(null, 6300)).toBeNull();
  });

  it("collapses multiple predictions from one wallet into a single participant", () => {
    const collapsed = collapseParticipants([
      vote({
        predictionId: "old",
        walletAddress: wallet(1),
        confidenceBps: 6000,
        capitalMicros: 1_000_000n,
        createdAt: new Date("2026-01-01"),
      }),
      vote({
        predictionId: "new",
        walletAddress: wallet(1),
        confidenceBps: 8000,
        capitalMicros: 2_000_000n,
        createdAt: new Date("2026-01-02"),
      }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.confidenceBps).toBe(8000);
    expect(collapsed[0]?.capitalMicros).toBe(3_000_000n);
  });
});

describe("ConvictionEngine snapshots", () => {
  it("stores a trail so conviction can be shown as 61 → 67 → 73", async () => {
    const store = memoryConvictionStore();
    const levels = [6100, 6700, 7300];
    for (const [index, bps] of levels.entries()) {
      await store.insertSnapshot({
        marketId: MARKET,
        engineVersion: "v1",
        participants: index + 1,
        capitalMicros: 1_000_000n,
        averageConfidenceBps: bps,
        capitalWeightedConfidenceBps: bps,
        convictionBps: bps,
        polymarketProbabilityBps: POLYMARKET,
        divergenceBps: bps - POLYMARKET,
        distributionJson: "[]",
        createdAt: new Date(`2026-03-01T00:0${index}:00.000Z`),
      });
    }
    const trail = trailFromSnapshots(await store.listSnapshots(MARKET, 8), 7300, 8);
    expect(trail).toEqual([61, 67, 73]);
  });

  it("does not snapshot an empty market", () => {
    expect(
      shouldPersistSnapshot({
        previous: null,
        nextConvictionBps: null,
        now: new Date(),
        intervalMs: 0,
        minDeltaBps: 50,
      }),
    ).toBe(false);
  });

  it("snapshots the first non-empty reading and later interval ticks", async () => {
    const votes = [vote({ predictionId: "p1", walletAddress: wallet(1), confidenceBps: 7000 })];
    const store = memoryConvictionStore(votes);
    let now = new Date("2026-04-01T00:00:00.000Z");
    const engine = new ConvictionEngine(
      { ...defaultConvictionEngineConfig, snapshotIntervalMs: 60_000 },
      store,
      () => now,
    );
    await engine.measure(MARKET, POLYMARKET);
    await engine.measure(MARKET, POLYMARKET);
    expect((await store.listSnapshots(MARKET, 10)).length).toBe(1);
    now = new Date(now.getTime() + 60_000);
    await engine.measure(MARKET, POLYMARKET);
    expect((await store.listSnapshots(MARKET, 10)).length).toBe(2);
  });
});

describe("ConvictionEngine DTO", () => {
  it("matches the public field names used by the dashboard", async () => {
    const votes = Array.from({ length: 3 }, (_, index) =>
      vote({
        predictionId: `d${index}`,
        walletAddress: wallet(index + 1),
        confidenceBps: 7000 + index * 100,
        capitalMicros: BigInt((index + 1) * 1_000_000),
      }),
    );
    const engine = new ConvictionEngine(
      defaultConvictionEngineConfig,
      memoryConvictionStore(votes),
    );
    const dto = await engine.measure(MARKET, POLYMARKET, { persist: "never" });
    expect(dto.marketId).toBe(MARKET);
    expect(dto.participants).toBe(3);
    expect(dto.capitalCommitted).toBe(6);
    expect(dto.averageConfidence).not.toBeNull();
    expect(dto.capitalWeightedConfidence).not.toBeNull();
    expect(dto.conviction).not.toBeNull();
    expect(dto.polymarketProbability).toBe(63);
    expect(dto.divergence).toBe(
      Math.round(((dto.conviction ?? 0) - 63) * 10) / 10,
    );
  });
});

describe("helpers", () => {
  it("falls back to the equal-weight mean when capital is zero", () => {
    expect(meanBps([6000, 8000])).toBe(7000);
    expect(
      capitalWeightedBps([
        { bps: 6000, capitalMicros: 0n },
        { bps: 8000, capitalMicros: 0n },
      ]),
    ).toBe(7000);
  });
});
