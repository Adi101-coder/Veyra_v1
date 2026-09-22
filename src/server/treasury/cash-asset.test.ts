import { describe, expect, it } from "vitest";
import { findAsset } from "@/server/treasury/config";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

/**
 * The cash ledger is denominated in one asset per deployment. If the configured
 * cash asset is not also a supported deposit asset, a user funds an account they
 * can never bet from: the deposit credits a balance row nothing spends.
 */
describe("cash asset and deposit assets must agree", () => {
  it("resolves a non-USDC cash asset on its own chain", () => {
    const env = {
      VEYRA_TREASURY_ASSETS: `USDG:${USDG}:4663:6`,
    } as unknown as NodeJS.ProcessEnv;
    const asset = findAsset("USDG", env);
    expect(asset).toMatchObject({ symbol: "USDG", chainId: 4663, decimals: 6 });
    expect(asset?.contract).toBe(USDG);
  });

  it("reports a cash asset that is not a deposit asset", () => {
    const env = { VEYRA_TREASURY_ASSETS: `USDG:${USDG}:4663:6` } as unknown as NodeJS.ProcessEnv;
    // USDC is the default cash asset; with only USDG configured it cannot be deposited.
    expect(findAsset("USDC", env)).toBeNull();
  });

  it("the cash ledger assumes 6 decimals, so a cash asset must have 6", () => {
    const env = {
      VEYRA_TREASURY_ASSETS: `WETH:0x1111111111111111111111111111111111111111:4663:18`,
    } as unknown as NodeJS.ProcessEnv;
    expect(findAsset("WETH", env)?.decimals).toBe(18);
  });
});
