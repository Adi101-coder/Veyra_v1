import { describe, expect, it } from "vitest";
import { ReputationEngine, forecastsFromRows } from "@/server/reputation/engine";
import { memoryReputationStore } from "@/server/reputation/store";
import { formatBrier } from "@/server/reputation/metrics";
import type { Forecast } from "@/server/reputation/types";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

function forecast(partial: Partial<Forecast> & Pick<Forecast, "predictionId" | "confidenceBps" | "predictedOutcome">): Forecast {
  return {
    walletAddress: WALLET,
    marketId: "hype",
    category: "finance",
    notionalMicros: 10_000_000n,
    payoutMicros: 20_000_000n,
    ...partial,
  };
}

function engineWith(rows: Forecast[]) {
  const store = memoryReputationStore();
  return new ReputationEngine(store, forecastsFromRows(rows));
}

describe("ReputationEngine", () => {
  it("does not treat an unresolved market as scored", async () => {
    const rows = [forecast({ predictionId: "p1", predictedOutcome: "YES", confidenceBps: 8000 })];
    const engine = engineWith(rows);
    await engine.recordOpen({ predictionId: "p1", walletAddress: WALLET, category: "finance" });
    const reputation = await engine.getReputation(WALLET);
    expect(reputation.totalPredictions).toBe(1);
    expect(reputation.resolvedPredictions).toBe(0);
    expect(reputation.accuracy).toBeNull();
    expect(reputation.brierScore).toBeNull();
    expect(reputation.calibration.ece).toBeNull();
    expect(reputation.roi).toBeNull();
  });

  it("rewards a correct high-confidence pick with a low Brier and positive ROI", async () => {
    const rows = [forecast({ predictionId: "p-high-yes", predictedOutcome: "YES", confidenceBps: 9000 })];
    const engine = engineWith(rows);
    await engine.recordOpen({ predictionId: "p-high-yes", walletAddress: WALLET, category: "finance" });
    await engine.resolveNow("hype", "YES");
    const reputation = await engine.getReputation(WALLET);
    expect(reputation.resolvedPredictions).toBe(1);
    expect(reputation.correctPredictions).toBe(1);
    expect(reputation.accuracy).toBe(1);
    expect(reputation.brierScore).toBe(formatBrier(10_000n));
    expect(reputation.averageConfidencePct).toBe(90);
    expect(reputation.roi).toBe("1.000000");
    expect(reputation.categories[0]?.category).toBe("finance");
  });

  it("penalizes an incorrect high-confidence pick", async () => {
    const rows = [forecast({ predictionId: "p-high-no", predictedOutcome: "YES", confidenceBps: 9000 })];
    const engine = engineWith(rows);
    await engine.recordOpen({ predictionId: "p-high-no", walletAddress: WALLET, category: "finance" });
    await engine.resolveNow("hype", "NO");
    const reputation = await engine.getReputation(WALLET);
    expect(reputation.correctPredictions).toBe(0);
    expect(reputation.accuracy).toBe(0);
    expect(reputation.brierScore).toBe(formatBrier(810_000n));
    expect(reputation.roi).toBe("-1.000000");
  });

  it("keeps a low-confidence miss milder than a high-confidence miss", async () => {
    const low = forecast({
      predictionId: "p-low",
      predictedOutcome: "YES",
      confidenceBps: 5500,
      marketId: "mica",
    });
    const engine = engineWith([low]);
    await engine.recordOpen({ predictionId: "p-low", walletAddress: WALLET, category: "finance" });
    await engine.resolveNow("mica", "NO");
    const reputation = await engine.getReputation(WALLET);
    expect(Number(reputation.brierScore)).toBeCloseTo(0.3025, 4);
    expect(reputation.accuracy).toBe(0);
  });

  it("aggregates multiple resolved predictions into stored stats without rescoring", async () => {
    const rows = [
      forecast({ predictionId: "a", predictedOutcome: "YES", confidenceBps: 8000, marketId: "hype" }),
      forecast({ predictionId: "b", predictedOutcome: "YES", confidenceBps: 8000, marketId: "hype" }),
      forecast({
        predictionId: "c",
        predictedOutcome: "NO",
        confidenceBps: 7000,
        marketId: "mica",
        category: "science",
      }),
    ];
    const engine = engineWith(rows);
    for (const row of rows) {
      await engine.recordOpen({
        predictionId: row.predictionId,
        walletAddress: WALLET,
        category: row.category,
      });
    }
    await engine.resolveNow("hype", "YES");
    await engine.resolveNow("mica", "YES");
    const reputation = await engine.getReputation(WALLET);
    expect(reputation.totalPredictions).toBe(3);
    expect(reputation.resolvedPredictions).toBe(3);
    expect(reputation.correctPredictions).toBe(2);
    expect(reputation.accuracy).toBeCloseTo(2 / 3);
    expect(reputation.calibration.bins.some((bin) => bin.bin === "80-90")).toBe(true);
    expect(reputation.categories).toHaveLength(2);
    const again = await engine.resolveNow("hype", "YES");
    expect("already" in again ? again.already : again.scored === 0).toBe(true);
    expect((await engine.getReputation(WALLET)).resolvedPredictions).toBe(3);
  });

  it("stores calibration from the resolved sample", async () => {
    const rows = [
      forecast({ predictionId: "c1", predictedOutcome: "YES", confidenceBps: 8000 }),
      forecast({ predictionId: "c2", predictedOutcome: "YES", confidenceBps: 8000 }),
    ];
    const engine = engineWith(rows);
    await engine.recordOpen({ predictionId: "c1", walletAddress: WALLET, category: "finance" });
    await engine.recordOpen({ predictionId: "c2", walletAddress: WALLET, category: "finance" });
    await engine.resolveNow("hype", "YES");
    const reputation = await engine.getReputation(WALLET);
    expect(reputation.calibration.ece).toBeCloseTo(0.2, 6);
    expect(reputation.calibration.bins[0]?.empiricalAccuracy).toBe(1);
    expect(reputation.calibration.bins[0]?.meanConfidencePct).toBe(80);
  });
});
