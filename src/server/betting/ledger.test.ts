import { describe, expect, it } from "vitest";
import { applyFillsToHeld, derivePositionStatus, settledHistoryStatus, unseenFills } from "@/server/betting/ledger";

const fill = (id: string, shares: bigint, notional: bigint) => ({
  venueTradeId: id,
  priceBps: 5000,
  sharesMicros: shares,
  notionalMicros: notional,
  feeMicros: 0n,
  isSimulated: false,
  rawJson: null,
});
const at = (ms: number) => new Date(ms);

describe("position ledger", () => {
  it("drops fills already recorded (by venue trade id)", () => {
    const fresh = unseenFills([{ venueTradeId: "t1" }], [fill("t1", 1n, 1n), fill("t2", 2n, 1n), fill("t2", 2n, 1n)]);
    expect(fresh.map((row) => row.venueTradeId)).toEqual(["t2"]);
  });

  it("BUY adds cost, SELL removes shares at average cost", () => {
    const empty = { sharesMicros: 0n, notionalMicros: 0n, avgPriceBps: 0 };
    const bought = applyFillsToHeld(empty, "BUY", [fill("a", 10_000_000n, 5_000_000n)]);
    expect(bought).toEqual({ sharesMicros: 10_000_000n, notionalMicros: 5_000_000n, avgPriceBps: 5000 });
    const sold = applyFillsToHeld(bought, "SELL", [fill("b", 4_000_000n, 2_400_000n)]);
    expect(sold).toEqual({ sharesMicros: 6_000_000n, notionalMicros: 3_000_000n, avgPriceBps: 5000 });
  });

  it("derives status from executions and held shares only", () => {
    expect(derivePositionStatus([{ id: "1", status: "submitted", createdAt: at(1) }], 0n)).toBe("pending");
    expect(derivePositionStatus([{ id: "1", status: "failed", createdAt: at(1) }], 0n)).toBe("failed");
    expect(derivePositionStatus([{ id: "1", status: "partial", createdAt: at(1) }], 5n)).toBe("partial");
    expect(
      derivePositionStatus(
        [
          { id: "1", status: "filled", createdAt: at(1) },
          { id: "2", status: "submitted", createdAt: at(2) },
        ],
        5n,
      ),
    ).toBe("adjusting");
    expect(
      derivePositionStatus(
        [
          { id: "1", status: "filled", createdAt: at(1) },
          { id: "2", status: "filled", createdAt: at(2) },
        ],
        0n,
      ),
    ).toBe("closed");
    expect(settledHistoryStatus("submitted")).toBeNull();
    expect(settledHistoryStatus("rejected")).toBe("failed");
  });
});

describe("confidence at the resolution cutoff", () => {
  it("uses the latest filled/noop change requested at or before the cutoff", async () => {
    const { confidenceAtCutoff } = await import("@/server/betting/service");
    const at = (iso: string) => new Date(iso);
    const cutoff = at("2026-09-17T12:00:00Z");
    const history = [
      { createdAt: at("2026-09-17T09:00:00Z"), status: "filled", previousConfidenceBps: 8000, newConfidenceBps: 6000 },
      { createdAt: at("2026-09-17T10:00:00Z"), status: "failed", previousConfidenceBps: 6000, newConfidenceBps: 9000 },
      { createdAt: at("2026-09-17T11:00:00Z"), status: "partial", previousConfidenceBps: 6000, newConfidenceBps: 4000 },
      { createdAt: at("2026-09-17T13:00:00Z"), status: "filled", previousConfidenceBps: 6000, newConfidenceBps: 2000 },
    ];
    expect(confidenceAtCutoff({ confidenceBps: 2000, confidenceHistory: history }, cutoff)).toBe(6000);
    expect(confidenceAtCutoff({ confidenceBps: 2000, confidenceHistory: history }, at("2026-09-17T08:00:00Z"))).toBe(8000);
    expect(confidenceAtCutoff({ confidenceBps: 7000 }, cutoff)).toBe(7000);
  });
});
