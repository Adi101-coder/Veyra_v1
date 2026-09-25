import { describe, expect, it } from "vitest";
import { predictionToWagerRow, type PredictionDTO } from "@/lib/betting";

function dto(partial: Partial<PredictionDTO> = {}): PredictionDTO {
  return {
    id: "p1",
    marketId: "m1",
    marketTitle: "Test",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    outcome: "YES",
    confidencePct: 80,
    stakeUsd: "10.00",
    marketPrice: "0.5000",
    status: "open",
    engineVersion: "test",
    createdAt: "2026-09-20T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    position: null,
    execution: null,
    tradePnlUsd: null,
    marketResolution: null,
    score: null,
    settlement: null,
    ...partial,
  };
}

describe("predictionToWagerRow", () => {
  it("marks LANDED from PredictionScore even when the live pick matches the market", () => {
    const row = predictionToWagerRow(
      dto({
        score: {
          resolvedOutcome: "YES",
          correct: true,
          brierScore: "0.040000",
          pnlUsd: "10.00",
          payoutUsd: "20.00",
          confidencePct: 80,
          resolvedAt: "2026-09-20T00:00:00.000Z",
        },
      }),
      (value) => value.slice(0, 6),
    );
    expect(row.resolution).toBe("RESOLVED");
    expect(row.left.note).toBe("LANDED");
    expect(row.right.note).toBe("MISSED");
  });

  it("marks MISSED from PredictionScore.correct, not from the current outcome field", () => {
    const row = predictionToWagerRow(
      dto({
        outcome: "YES",
        marketResolution: { outcome: "YES", resolvedAt: "2026-09-20T00:00:00.000Z" },
        score: {
          resolvedOutcome: "NO",
          correct: false,
          brierScore: "0.640000",
          pnlUsd: "-10.00",
          payoutUsd: "0.00",
          confidencePct: 80,
          resolvedAt: "2026-09-20T00:00:00.000Z",
        },
      }),
      (value) => value.slice(0, 6),
    );
    expect(row.left.note).toBe("MISSED");
  });
});
