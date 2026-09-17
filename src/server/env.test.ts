import { describe, expect, it } from "vitest";
import { validateEnvironment } from "@/server/env";

const KEY = `0x${"ab".repeat(32)}`;
const PROD_LIVE = {
  NODE_ENV: "production",
  DATABASE_URL: "file:/data/veyra.db",
  VEYRA_SESSION_SECRET: "s".repeat(40),
  VEYRA_OPERATOR_TOKEN: "o".repeat(30),
  POLYMARKET_EXECUTION_MODE: "live",
  POLYMARKET_CHAIN_ID: "137",
  POLYMARKET_PRIVATE_KEY: KEY,
  POLYMARKET_API_KEY: "k",
  POLYMARKET_API_SECRET: "s",
  POLYMARKET_API_PASSPHRASE: "p",
  POLYMARKET_SIGNATURE_TYPE: "2",
  POLYMARKET_FUNDER_ADDRESS: `0x${"cd".repeat(20)}`,
  POLYGON_RPC_URL: "https://polygon.example/rpc",
  VEYRA_WORKER_INTERVAL_MS: "15000",
  RH_NETWORK: "testnet",
  NEXT_PUBLIC_RH_NETWORK: "testnet",
  RH_TESTNET_RPC_URL: "https://robinhood-testnet.example/v2/key",
};

describe("production environment preflight", () => {
  it("accepts a complete live production configuration", () => {
    const report = validateEnvironment(PROD_LIVE);
    expect(report.errors).toEqual([]);
    expect(report.mode).toBe("live");
    expect(report.configured).toMatchObject({ polymarketApiCredentials: true, polymarketFunder: true, worker: true });
  });

  it("never exposes secret values", () => {
    const serialized = JSON.stringify(validateEnvironment({ ...PROD_LIVE, POLYMARKET_SIGNATURE_TYPE: "9" }));
    for (const secret of [KEY, PROD_LIVE.VEYRA_SESSION_SECRET, PROD_LIVE.VEYRA_OPERATOR_TOKEN, "/v2/key"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("refuses production without secrets or an explicit execution mode", () => {
    const report = validateEnvironment({ NODE_ENV: "production", DATABASE_URL: "file:x.db" });
    expect(report.errors.join("\n")).toMatch(/VEYRA_SESSION_SECRET/);
    expect(report.errors.join("\n")).toMatch(/VEYRA_OPERATOR_TOKEN/);
    expect(report.errors.join("\n")).toMatch(/POLYMARKET_EXECUTION_MODE must be set explicitly/);
  });

  it("catches live-mode misconfiguration before the first order", () => {
    const cases: [Record<string, string | undefined>, RegExp][] = [
      [{ POLYMARKET_PRIVATE_KEY: "0x1234" }, /POLYMARKET_PRIVATE_KEY/],
      [{ POLYMARKET_API_SECRET: undefined }, /all three/],
      [{ POLYMARKET_FUNDER_ADDRESS: undefined }, /POLYMARKET_FUNDER_ADDRESS/],
      [{ POLYMARKET_SIGNATURE_TYPE: "7" }, /SIGNATURE_TYPE/],
      [{ POLYMARKET_CHAIN_ID: "1" }, /POLYMARKET_CHAIN_ID/],
      [{ POLYMARKET_CLOB_URL: "http://clob.polymarket.com" }, /https/],
      [{ NEXT_PUBLIC_RH_NETWORK: "mainnet" }, /must match RH_NETWORK/],
      [{ RH_NETWORK: "mainnet" }, /RH_ENABLE_MAINNET/],
      [{ RH_SETTLEMENT_ENABLED: "true" }, /RH_SETTLEMENT_PRIVATE_KEY/],
      [{ VEYRA_OMNIBUS_USDC_BASELINE_MICROS: "100" }, /BASELINE/],
      [{ VEYRA_MAX_SLIPPAGE_BPS: "9000" }, /VEYRA_MAX_SLIPPAGE_BPS/],
    ];
    for (const [patch, expected] of cases) {
      expect(validateEnvironment({ ...PROD_LIVE, ...patch }).errors.join("\n")).toMatch(expected);
    }
  });

  it("development only warns and defaults to paper", () => {
    const report = validateEnvironment({ DATABASE_URL: "file:./dev.db" });
    expect(report.errors).toEqual([]);
    expect(report.mode).toBe("paper");
    expect(report.warnings.join("\n")).toMatch(/SESSION_SECRET/);
  });
});

describe(".env.production.example", () => {
  it("lists every required variable and validates once placeholders are filled", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(".env.production.example", "utf8");
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
      if (match) env[match[1]!] = match[2]!;
    }
    for (const key of ["DATABASE_URL", "VEYRA_SESSION_SECRET", "VEYRA_OPERATOR_TOKEN", "POLYMARKET_EXECUTION_MODE", "POLYMARKET_PRIVATE_KEY", "POLYMARKET_API_KEY", "POLYMARKET_SIGNATURE_TYPE", "RH_NETWORK", "NEXT_PUBLIC_RH_NETWORK", "RH_SETTLEMENT_PRIVATE_KEY"]) {
      expect(Object.keys(env)).toContain(key);
    }
    expect(validateEnvironment(env).errors.length).toBeGreaterThan(0); // empty secrets must not boot
    const filled = {
      ...env,
      VEYRA_SESSION_SECRET: "s".repeat(40),
      VEYRA_OPERATOR_TOKEN: "o".repeat(30),
      POLYMARKET_PRIVATE_KEY: `0x${"ab".repeat(32)}`,
      POLYMARKET_API_KEY: "k",
      POLYMARKET_API_SECRET: "s",
      POLYMARKET_API_PASSPHRASE: "p",
      POLYGON_RPC_URL: "https://polygon.example",
      RH_TESTNET_RPC_URL: "https://rh.example",
      RH_SETTLEMENT_PRIVATE_KEY: `0x${"cd".repeat(32)}`,
    };
    expect(validateEnvironment(filled).errors).toEqual([]);
  });
});
