import { describe, expect, it } from "vitest";
import { liveTestSafety } from "@/server/launch/live-test";

describe("LAUNCH.md §6 live-test safety", () => {
  it("refuses a live venue test that would debit user balances", () => {
    expect(
      liveTestSafety({
        VEYRA_CUSTODY_ENABLED: "true",
        POLYMARKET_EXECUTION_MODE: "live",
        VEYRA_MAX_STAKE_USD: "10",
      } as unknown as NodeJS.ProcessEnv).ok,
    ).toBe(false);
  });

  it("accepts a tiny-cap venue test with custody off", () => {
    expect(
      liveTestSafety({
        VEYRA_CUSTODY_ENABLED: "false",
        POLYMARKET_EXECUTION_MODE: "live",
        VEYRA_MAX_STAKE_USD: "25",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ ok: true, findings: [] });
  });
});
