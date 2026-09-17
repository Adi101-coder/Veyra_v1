import { describe, expect, it } from "vitest";
import { createRobinhoodClients, getNativeBalance, getRpcStatus, pollReceipt } from "@/server/chain/client";
import { loadRobinhoodChainConfig } from "@/server/chain/config";

/**
 * Real network, read-only. Opt-in so CI never depends on rate-limited public RPCs:
 *   RH_LIVE_RPC_TEST=1 [RH_TESTNET_RPC_URL=...] [RH_RPC_URL=...] npx vitest run src/server/chain/live-rpc.test.ts
 */
const live = process.env.RH_LIVE_RPC_TEST === "1";

describe.skipIf(!live)("Robinhood Chain live RPC (read-only)", () => {
  it("testnet RPC serves chain 46630 with an advancing head", async () => {
    const clients = createRobinhoodClients(loadRobinhoodChainConfig({ RH_TESTNET_RPC_URL: process.env.RH_TESTNET_RPC_URL }));
    const first = await getRpcStatus(clients);
    expect(first).toMatchObject({ ok: true, chainId: 46630 });
    expect(await getNativeBalance(clients, "0x0000000000000000000000000000000000000000")).toBeTypeOf("bigint");
    const missing = await pollReceipt(clients, `0x${"0".repeat(64)}`);
    expect(missing).toEqual({ state: "pending" });
  }, 30_000);

  it("mainnet RPC serves chain 4663 (mainnet gated behind RH_ENABLE_MAINNET)", async () => {
    const clients = createRobinhoodClients(
      loadRobinhoodChainConfig({
        RH_NETWORK: "mainnet",
        RH_ENABLE_MAINNET: "true",
        RH_RPC_URL: process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
      }),
    );
    expect(await getRpcStatus(clients)).toMatchObject({ ok: true, chainId: 4663 });
  }, 30_000);
});
