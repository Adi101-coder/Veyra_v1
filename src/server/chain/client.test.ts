import { describe, expect, it } from "vitest";
import { decodeFunctionResult, encodeFunctionResult, parseAbi, parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertRpcChain,
  broadcast,
  classifyChainError,
  createRobinhoodClients,
  getNativeBalance,
  getRpcStatus,
  pollReceipt,
  readRobinhoodContract,
  signTransaction,
} from "@/server/chain/client";
import { loadRobinhoodChainConfig } from "@/server/chain/config";
import { createSimulatedChain, RpcFailure } from "@/server/chain/testing/simulated-chain";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const signer = privateKeyToAccount(KEY);

function setup(chainId = 46630, env: Record<string, string> = {}) {
  const chain = createSimulatedChain({ chainId });
  const config = loadRobinhoodChainConfig({ RH_SETTLEMENT_ENABLED: "true", RH_SETTLEMENT_PRIVATE_KEY: KEY, ...env });
  return { chain, clients: createRobinhoodClients(config, chain.transport) };
}

describe("Robinhood Chain RPC client", () => {
  it("checks connectivity and refuses an RPC serving the wrong chain", async () => {
    const ok = setup();
    await expect(getRpcStatus(ok.clients)).resolves.toMatchObject({ ok: true, chainId: 46630, blockNumber: 1000n });
    const wrong = setup(4663);
    await expect(assertRpcChain(wrong.clients)).rejects.toMatchObject({ kind: "wrong_chain" });
    await expect(getRpcStatus(wrong.clients)).resolves.toMatchObject({ ok: false, error: "wrong_chain" });
  });

  it("reads balances and contracts", async () => {
    const { chain, clients } = setup();
    chain.setBalance(signer.address, 123n);
    expect(await getNativeBalance(clients, signer.address)).toBe(123n);
    const abi = parseAbi(["function totalSupply() view returns (uint256)"]);
    chain.state.contractReturn = encodeFunctionResult({ abi, functionName: "totalSupply", result: 42n }) as Hex;
    const value = await readRobinhoodContract(clients, {
      address: "0x0000000000000000000000000000000000000001",
      abi,
      functionName: "totalSupply",
    });
    expect(value).toBe(42n);
    expect(decodeFunctionResult({ abi, functionName: "totalSupply", data: chain.state.contractReturn })).toBe(42n);
  });

  it("signs an EIP-1559 transaction for the configured chain that recovers to the signer", async () => {
    const { clients } = setup();
    const signed = await signTransaction(clients, { to: signer.address, data: "0x1234" });
    const tx = parseTransaction(signed.raw);
    expect(tx.chainId).toBe(46630);
    expect(tx.type).toBe("eip1559");
    expect(tx.nonce).toBe(0);
    expect(tx.gas).toBe(30_000n); // 25k estimate + 20%
    expect(await recoverTransactionAddress({ serializedTransaction: signed.raw as never })).toBe(signer.address);
  });

  it("enforces the fee cap and the balance check before signing", async () => {
    const pricey = createSimulatedChain({ chainId: 46630, baseFeeWei: 10n * 1_000_000_000n });
    const clients = createRobinhoodClients(
      loadRobinhoodChainConfig({ RH_SETTLEMENT_PRIVATE_KEY: KEY, RH_MAX_FEE_GWEI: "5" }),
      pricey.transport,
    );
    await expect(signTransaction(clients, { to: signer.address })).rejects.toMatchObject({ kind: "fee_cap_exceeded" });
    const { chain, clients: poor } = setup();
    chain.setBalance(signer.address, 1n);
    await expect(signTransaction(poor, { to: signer.address })).rejects.toMatchObject({ kind: "insufficient_funds", retryable: true });
  });

  it("broadcast is idempotent for the same bytes; receipts need confirmations", async () => {
    const { chain, clients } = setup(46630, { RH_CONFIRMATIONS: "3" });
    const signed = await signTransaction(clients, { to: signer.address });
    expect(await broadcast(clients, signed)).toBe(signed.hash);
    expect(await broadcast(clients, signed)).toBe(signed.hash); // "already known"
    expect(chain.state.sendCount).toBe(1);
    expect(await pollReceipt(clients, signed.hash)).toEqual({ state: "pending" });
    chain.mine();
    expect((await pollReceipt(clients, signed.hash)).state).toBe("confirming");
    chain.mine(2);
    expect(await pollReceipt(clients, signed.hash)).toMatchObject({ state: "confirmed", confirmations: 3 });
  });

  it("classifies RPC failures", () => {
    expect(classifyChainError(new RpcFailure("rate limited", -32005, 429))).toMatchObject({ kind: "rate_limited", retryable: true });
    expect(classifyChainError(new Error("nonce too low"))).toMatchObject({ kind: "nonce_too_low", retryable: false });
    expect(classifyChainError(new Error("replacement transaction underpriced"))).toMatchObject({ kind: "replacement_underpriced" });
    expect(classifyChainError(new Error("The request took too long to respond. timed out"))).toMatchObject({ kind: "timeout" });
    expect(classifyChainError(new Error("fetch failed"))).toMatchObject({ kind: "network", retryable: true });
  });
});
