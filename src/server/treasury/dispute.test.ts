import { describe, expect, it } from "vitest";
import { poolPayoutsOpen } from "@/server/treasury/dispute";

describe("Pool dispute window", () => {
  const env = { VEYRA_POOL_DISPUTE_WINDOW_HOURS: "24" } as unknown as NodeJS.ProcessEnv;

  it("blocks pool cash until the window elapses or an operator authorizes", () => {
    const resolvedAt = new Date("2026-01-01T00:00:00Z");
    expect(
      poolPayoutsOpen({ source: "veyra", resolvedAt, payoutsAuthorizedAt: null }, new Date("2026-01-01T12:00:00Z"), env),
    ).toBe(false);
    expect(
      poolPayoutsOpen({ source: "veyra", resolvedAt, payoutsAuthorizedAt: null }, new Date("2026-01-02T00:00:00Z"), env),
    ).toBe(true);
    expect(
      poolPayoutsOpen(
        { source: "veyra", resolvedAt, payoutsAuthorizedAt: new Date("2026-01-01T01:00:00Z") },
        new Date("2026-01-01T01:01:00Z"),
        env,
      ),
    ).toBe(true);
  });

  it("does not delay Polymarket venue resolutions", () => {
    expect(
      poolPayoutsOpen(
        { source: "polymarket", resolvedAt: new Date("2026-01-01T00:00:00Z"), payoutsAuthorizedAt: null },
        new Date("2026-01-01T00:00:01Z"),
        env,
      ),
    ).toBe(true);
  });
});
