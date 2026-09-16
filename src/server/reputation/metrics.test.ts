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
