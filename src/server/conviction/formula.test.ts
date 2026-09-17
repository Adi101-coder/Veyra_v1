import { describe, expect, it } from "vitest";
import { ConvictionEngine } from "@/server/conviction/engine";
import { defaultConvictionEngineConfig } from "@/server/conviction/config";
import { computeConviction, divRound, eligiblePosition, inputsHash, microsToUsd } from "@/server/conviction/formula";
import { memoryConvictionStore } from "@/server/conviction/store";
import type { ConvictionPosition, PolymarketReference } from "@/server/conviction/types";

const MID: PolymarketReference = { probabilityBps: 5200, source: "clob_midpoint" };
const usd = (value: number) => BigInt(value) * 1_000_000n;
let seq = 0;
function pos(wallet: string, outcome: "YES" | "NO", confidenceBps: number, capitalUsd: number, extra: Partial<ConvictionPosition> = {}): ConvictionPosition {
  seq += 1;
  return {
    predictionId: `p${seq.toString().padStart(4, "0")}`,
    walletAddress: wallet,
    outcome,
    confidenceBps,
    sharesMicros: usd(capitalUsd) * 2n,
    capitalMicros: usd(capitalUsd),
    status: "filled",
    ...extra,
  };
}
const compute = (positions: ConvictionPosition[], polymarket: PolymarketReference = MID) =>
  computeConviction({ marketId: "m", positions, polymarket, capitalBlendBps: 5500, binCount: 10 });

const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const C = "0x" + "c".repeat(40);

describe("conviction formula (hand-computed reference)", () => {
  // A: YES 80% $30 | B: NO 70% $10 (implied 30%) | C: YES 60% $20 and NO 90% $20 (hedger)
  const reference = () => [pos(A, "YES", 8000, 30), pos(B, "NO", 7000, 10), pos(C, "YES", 6000, 20), pos(C, "NO", 9000, 20)];

  it("computes every headline number exactly", () => {
    const result = compute(reference());
    expect(result.participants).toBe(3);
    expect(result.capitalMicros).toBe(usd(80));
    // Wallet implied YES: A 8000, B 3000, C (6000*20 + 1000*20)/40 = 3500 → mean 4833.33 → 4833
    expect(result.averageConfidenceBps).toBe(4833);
    // (8000*30 + 3000*10 + 1000*20 + 6000*20) / 80 = 5125
    expect(result.capitalWeightedConfidenceBps).toBe(5125);
    // (4833*4500 + 5125*5500) / 10000 = 4993.6 → 4994
    expect(result.convictionBps).toBe(4994);
    expect(result.divergenceBps).toBe(4994 - 5200);
  });

  it("keeps a hedger's YES and NO capital on their own sides", () => {
    const result = compute(reference());
    expect(result.outcomes.YES).toMatchObject({ participants: 2, capitalMicros: usd(50).toString(), averageConfidenceBps: 7000, capitalWeightedConfidenceBps: 7200 });
    // (7000*10 + 9000*20) / 30 = 8333.33 → 8333
    expect(result.outcomes.NO).toMatchObject({ participants: 2, capitalMicros: usd(30).toString(), averageConfidenceBps: 8000, capitalWeightedConfidenceBps: 8333 });
    const binCapital = result.distribution.reduce((sum, bin) => sum + BigInt(bin.capitalMicros), 0n);
    expect(binCapital).toBe(usd(80));
    expect(result.distribution.reduce((sum, bin) => sum + bin.participants, 0)).toBe(4); // wallet-side holdings
  });

  it("weights by filled capital, so a partial fill counts only what filled", () => {
    const full = compute([pos(A, "YES", 9000, 100), pos(B, "YES", 5000, 100)]);
    const partial = compute([pos(A, "YES", 9000, 25), pos(B, "YES", 5000, 100)]);
    expect(full.capitalWeightedConfidenceBps).toBe(7000);
    expect(partial.capitalWeightedConfidenceBps).toBe(5800); // (9000*25 + 5000*100)/125
    expect(partial.averageConfidenceBps).toBe(7000); // equal weight per wallet is unaffected
  });

  it("merges a wallet's multiple predictions on one side by capital", () => {
    const result = compute([pos(A, "YES", 9000, 10), pos(A, "YES", 6000, 30)]);
    expect(result.participants).toBe(1);
    expect(result.outcomes.YES.capitalWeightedConfidenceBps).toBe(6750);
  });

  it("never counts pending, failed, zero-share or zero-capital positions", () => {
    const excluded = [
      pos(B, "NO", 9900, 50, { status: "pending", sharesMicros: 0n }),
      pos(B, "NO", 9900, 50, { status: "failed" }),
      pos(C, "NO", 9900, 50, { sharesMicros: 0n, status: "closed" }),
      pos(C, "NO", 9900, 0),
    ];
    expect(excluded.some(eligiblePosition)).toBe(false);
    const result = compute([pos(A, "YES", 8000, 30), ...excluded]);
    expect(result).toMatchObject({ participants: 1, capitalMicros: usd(30), averageConfidenceBps: 8000, convictionBps: 8000 });
  });

  it("an empty market reports nulls, not a default 50%", () => {
    const result = compute([]);
    expect(result).toMatchObject({ participants: 0, capitalMicros: 0n, averageConfidenceBps: null, capitalWeightedConfidenceBps: null, convictionBps: null, divergenceBps: null });
    expect(result.outcomes.YES.averageConfidenceBps).toBeNull();
    expect(result.distribution.every((bin) => bin.participants === 0)).toBe(true);
  });

  it("no divergence without a Polymarket midpoint", () => {
    const result = compute([pos(A, "YES", 8000, 30)], { probabilityBps: null, source: "unavailable" });
    expect(result.convictionBps).toBe(8000);
    expect(result.divergenceBps).toBeNull();
  });

  it("is deterministic: input order and address case do not change results or the audit hash", () => {
    const rows = reference();
    const shuffled = [rows[2]!, rows[0]!, rows[3]!, rows[1]!].map((row) => ({ ...row, walletAddress: row.walletAddress.toUpperCase().replace("0X", "0x") }));
    const a = compute(rows);
    const b = compute(shuffled);
    expect(b).toEqual(a);
    expect(inputsHash(rows, MID)).toBe(a.inputsHash);
    expect(compute(rows, { probabilityBps: 5300, source: "clob_midpoint" }).inputsHash).not.toBe(a.inputsHash);
  });

  it("integer helpers round half up and format USD without floats", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(microsToUsd(80_125_000n)).toBe("80.12");
  });
});

describe("ConvictionEngine", () => {
  it("uses the resolved price after resolution and writes one snapshot per bucket under concurrency", async () => {
    const resolutions = new Map([["m", { outcome: "YES", resolvedAt: new Date("2026-09-17T12:00:00Z") }]]);
    const store = memoryConvictionStore([{ ...pos(A, "YES", 8000, 30), marketId: "m" }], resolutions);
    const engine = new ConvictionEngine(defaultConvictionEngineConfig, store, () => new Date("2026-09-17T12:01:00Z"));
    const results = await Promise.all([engine.measure("m", MID), engine.measure("m", MID), engine.measure("m", MID)]);
    for (const result of results) {
      expect(result).toMatchObject({ polymarketSource: "resolved", polymarketProbabilityBps: 10_000, convictionBps: 8000, divergenceBps: -2000, resolution: { outcome: "YES" } });
    }
    expect((await store.listSnapshots("m", 100)).length).toBe(1);
    const invalid = new ConvictionEngine(defaultConvictionEngineConfig, memoryConvictionStore([], new Map([["m", { outcome: "INVALID", resolvedAt: new Date() }]])));
    expect(await invalid.measure("m", MID)).toMatchObject({ polymarketProbability: null, divergence: null, participants: 0 });
  });

  it("exposes auditable exact fields alongside display percentages", async () => {
    const store = memoryConvictionStore(
      [pos(A, "YES", 8000, 30), pos(B, "NO", 7000, 10)].map((row) => ({ ...row, marketId: "m" })),
    );
    const dto = await new ConvictionEngine(defaultConvictionEngineConfig, store).measure("m", MID, { persist: "never" });
    expect(dto).toMatchObject({ participants: 2, totalCapitalUsd: "40.00", capitalMicros: "40000000", polymarketProbability: 52, polymarketSource: "clob_midpoint" });
    expect(dto.conviction).toBe(dto.convictionBps! / 100);
    expect(dto.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.methodology.definitions.capital).toContain("Cost basis");
    expect(dto.snapshotAt).toBeNull();
    expect(Date.parse(dto.asOf)).not.toBeNaN();
  });
});
