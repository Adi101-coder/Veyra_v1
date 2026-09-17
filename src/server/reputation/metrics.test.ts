import { describe, expect, it } from "vitest";
import {
  brierMicros,
  confidenceBinIndex,
  expectedCalibrationError,
  impliedYesBps,
  pnlMicros,
  scoreForecast,
} from "@/server/reputation/metrics";

describe("reputation metrics", () => {
  it("scores a correct high-confidence YES as a small Brier", () => {
    const scored = scoreForecast({
      predictedOutcome: "YES",
      resolvedOutcome: "YES",
      confidenceBps: 9000,
      notionalMicros: 10_000_000n,
      payoutMicros: 20_000_000n,
    });
    expect(scored.correct).toBe(true);
    expect(scored.impliedYesBps).toBe(9000);
    expect(scored.brierMicros).toBe(brierMicros(9000, "YES"));
    expect(scored.brierMicros).toBe(10_000n);
    expect(scored.pnlMicros).toBe(10_000_000n);
  });

  it("scores an incorrect high-confidence YES as a large Brier", () => {
    const scored = scoreForecast({
      predictedOutcome: "YES",
      resolvedOutcome: "NO",
      confidenceBps: 9000,
      notionalMicros: 10_000_000n,
      payoutMicros: 20_000_000n,
    });
    expect(scored.correct).toBe(false);
    expect(scored.brierMicros).toBe(810_000n);
    expect(scored.pnlMicros).toBe(-10_000_000n);
  });

  it("treats a low-confidence miss as milder than a high-confidence miss", () => {
    const low = scoreForecast({
      predictedOutcome: "YES",
      resolvedOutcome: "NO",
      confidenceBps: 5500,
      notionalMicros: 1_000_000n,
      payoutMicros: 2_000_000n,
    });
    const high = scoreForecast({
      predictedOutcome: "YES",
      resolvedOutcome: "NO",
      confidenceBps: 9000,
      notionalMicros: 1_000_000n,
      payoutMicros: 2_000_000n,
    });
    expect(low.brierMicros < high.brierMicros).toBe(true);
    expect(impliedYesBps("NO", 8000)).toBe(2000);
  });

  it("computes ECE from confidence bins", () => {
    const ece = expectedCalibrationError(
      [
        { binIndex: 8, sampleCount: 2, sumConfidenceBps: 16000n, correctCount: 1 },
        { binIndex: 5, sampleCount: 0, sumConfidenceBps: 0n, correctCount: 0 },
      ],
      2,
    );
    expect(ece).toBeCloseTo(0.3, 6);
    expect(confidenceBinIndex(8000)).toBe(8);
    expect(pnlMicros(true, 0n, 5n)).toBe(0n);
  });
});

describe("Brier and PnL reference values", () => {
  it("matches the textbook values", async () => {
    const { scoreForecast, formatBrier } = await import("@/server/reputation/metrics");
    const brier = (predictedOutcome: "YES" | "NO", confidenceBps: number, resolvedOutcome: "YES" | "NO") =>
      formatBrier(scoreForecast({ predictedOutcome, confidenceBps, resolvedOutcome, notionalMicros: 0n, payoutMicros: 0n }).brierMicros);
    expect(brier("YES", 9000, "YES")).toBe("0.010000");
    expect(brier("YES", 9000, "NO")).toBe("0.810000");
    expect(brier("YES", 5000, "YES")).toBe("0.250000");
    expect(brier("YES", 5000, "NO")).toBe("0.250000");
    expect(brier("NO", 9000, "YES")).toBe("0.810000");
    expect(brier("NO", 9000, "NO")).toBe("0.010000");
  });

  it("PnL counts held winning shares, sell proceeds and cost", async () => {
    const { scoreForecast } = await import("@/server/reputation/metrics");
    // Bought 10 shares for $5, sold 4 for $2.40, 6 held; YES wins -> 6 + 2.40 - 5 = 3.40
    const win = scoreForecast({ predictedOutcome: "YES", confidenceBps: 7000, resolvedOutcome: "YES", notionalMicros: 5_000_000n, payoutMicros: 6_000_000n, proceedsMicros: 2_400_000n });
    expect(win.pnlMicros).toBe(3_400_000n);
    const loss = scoreForecast({ predictedOutcome: "YES", confidenceBps: 7000, resolvedOutcome: "NO", notionalMicros: 5_000_000n, payoutMicros: 6_000_000n, proceedsMicros: 2_400_000n });
    expect(loss.pnlMicros).toBe(-2_600_000n);
  });
});
