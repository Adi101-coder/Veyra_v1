import { decodeAbiParameters, keccak256, parseTransaction, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { createRobinhoodClients } from "@/server/chain/client";
import { loadRobinhoodChainConfig } from "@/server/chain/config";
import {
  enqueueSettlements,
  pollSettlementReceipts,
  runSettlementTick,
  SETTLEMENT_TAG,
  submitSettlements,
  type SettlementDeps,
} from "@/server/chain/settlement";
import { createSimulatedChain, RpcFailure } from "@/server/chain/testing/simulated-chain";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const SIGNER = privateKeyToAccount(KEY).address;

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;
let seq = 0;

beforeAll(() => {
  database = createTestDatabase("chain");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.chainSettlement.deleteMany();
  await prisma.predictionScore.deleteMany();
  await prisma.prediction.deleteMany();
});

async function scoredPrediction() {
  seq += 1;
  const wallet = "0xa11ce00000000000000000000000000000000001";
  await prisma.market.upsert({
    where: { id: "chain-market" },
    create: { id: "chain-market", title: "t", category: "crypto", tag: "t", status: "resolved", source: "polymarket" },
    update: {},
  });
  await prisma.userReputation.upsert({ where: { walletAddress: wallet }, create: { walletAddress: wallet }, update: {} });
  const prediction = await prisma.prediction.create({
    data: {
      walletAddress: wallet,
      marketId: "chain-market",
      outcome: "YES",
      confidenceBps: 7000,
      stakeMicros: 100_000_000n,
      marketPriceBps: 5000,
      engineVersion: "v1",
      engineInputJson: "{}",
      engineOutputJson: "{}",
      status: "accepted",
      idempotencyKey: `chain-${seq}`,
    },
  });
  await prisma.predictionScore.create({
    data: {
      predictionId: prediction.id,
      walletAddress: wallet,
      marketId: "chain-market",
      category: "crypto",
      predictedOutcome: "YES",
      resolvedOutcome: "YES",
      confidenceBps: 7000,
      impliedYesBps: 7000,
      correct: true,
      brierMicros: 90_000n,
      notionalMicros: 15_000_000n,
      payoutMicros: 30_000_000n,
      pnlMicros: 15_000_000n,
      resolvedAt: new Date("2026-09-17T00:00:00Z"),
    },
  });
  return prediction.id;
}

function harness(env: Record<string, string> = {}) {
  const chain = createSimulatedChain({ chainId: 46630 });
  const config = loadRobinhoodChainConfig({
    RH_SETTLEMENT_ENABLED: "true",
    RH_SETTLEMENT_PRIVATE_KEY: KEY,
    RH_RECEIPT_TIMEOUT_MS: "60000",
    ...env,
  });
  let now = new Date("2026-09-17T12:00:00Z");
  const deps: SettlementDeps = { prisma, clients: createRobinhoodClients(config, chain.transport), now: () => now };
  return { chain, deps, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

const row = (predictionId: string) => prisma.chainSettlement.findFirstOrThrow({ where: { predictionId } });

describe("Robinhood Chain settlement lifecycle", () => {
  it("links a scored prediction to a confirmed on-chain attestation (only after the receipt)", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps } = harness();

    expect(await enqueueSettlements(deps)).toBe(1);
    expect(await enqueueSettlements(deps)).toBe(0); // idempotent

    await runSettlementTick(deps);
    let settlement = await row(predictionId);
    expect(settlement.status).toBe("submitted"); // broadcast is NOT settled
    expect(settlement.blockNumber).toBeNull();
    expect(chain.state.sendCount).toBe(1);

    chain.mine();
    await runSettlementTick(deps);
    settlement = await row(predictionId);
    expect(settlement).toMatchObject({ status: "confirmed", chainId: 46630, network: "testnet", nonce: 0, fromAddress: SIGNER });
    expect(settlement.blockNumber).toBe(1001n);

    // The on-chain input is the settlement payload and references the prediction id.
    const tx = parseTransaction(settlement.rawTx as Hex);
    expect(tx.to?.toLowerCase()).toBe(SIGNER.toLowerCase());
    expect(tx.value ?? 0n).toBe(0n);
    expect(keccak256(tx.data!)).toBe(settlement.payloadHash);
    const decoded = decodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint16" },
        { type: "bool" },
        { type: "uint256" },
        { type: "int256" },
        { type: "uint256" },
        { type: "uint64" },
      ],
      tx.data!,
    );
    expect(decoded[0]).toBe(SETTLEMENT_TAG);
    expect(decoded[1]).toBe(predictionId);
    expect(decoded[7]).toBe(true);
    expect(decoded[9]).toBe(15_000_000n);

    // Nothing is re-sent once confirmed.
    await runSettlementTick(deps);
    expect(chain.state.sendCount).toBe(1);
  });

  it("a crash between signing and broadcast resends the same bytes (no duplicate transaction)", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps } = harness();
    await enqueueSettlements(deps);
    chain.failOnce("eth_sendRawTransaction", new RpcFailure("connection reset: fetch failed"));
    await submitSettlements(deps);
    const signed = await row(predictionId);
    expect(signed.status).toBe("signed");
    expect(chain.state.sendCount).toBe(0);

    // A second submitter must not sign a new nonce while bytes are unbroadcast.
    await scoredPrediction();
    await enqueueSettlements(deps);
    expect(await submitSettlements(deps)).toBe(0);

    const receipts = await pollSettlementReceipts(deps);
    expect(receipts.rebroadcast).toBe(1);
    const resent = await row(predictionId);
    expect(resent.status).toBe("submitted");
    expect(resent.txHash).toBe(signed.txHash);
    chain.mine();
    await pollSettlementReceipts(deps);
    expect((await row(predictionId)).status).toBe("confirmed");
  });

  it("retries transient signing failures with backoff, then fails after max attempts", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps, advance } = harness({ RH_SETTLEMENT_MAX_ATTEMPTS: "2" });
    chain.setBalance(SIGNER, 0n);
    await enqueueSettlements(deps);
    await submitSettlements(deps);
    let settlement = await row(predictionId);
    expect(settlement).toMatchObject({ status: "queued", attempts: 1, lastErrorKind: "insufficient_funds" });
    expect(settlement.txHash).toBeNull();

    await submitSettlements(deps); // still backing off
    expect((await row(predictionId)).attempts).toBe(1);

    advance(60_000);
    // A one-off 429 is absorbed by the viem transport retry; the signer is still unfunded.
    chain.failOnce("eth_getTransactionCount", new RpcFailure("Too Many Requests", -32005, 429));
    await submitSettlements(deps);
    settlement = await row(predictionId);
    expect(settlement).toMatchObject({ status: "failed", attempts: 2, lastErrorKind: "insufficient_funds" });
    expect(chain.state.sendCount).toBe(0);
  });

  it("an RPC on the wrong chain never signs", async () => {
    const predictionId = await scoredPrediction();
    const chain = createSimulatedChain({ chainId: 4663 });
    const deps: SettlementDeps = {
      prisma,
      clients: createRobinhoodClients(
        loadRobinhoodChainConfig({ RH_SETTLEMENT_ENABLED: "true", RH_SETTLEMENT_PRIVATE_KEY: KEY }),
        chain.transport,
      ),
    };
    await enqueueSettlements(deps);
    await submitSettlements(deps);
    expect(await row(predictionId)).toMatchObject({ status: "failed", lastErrorKind: "wrong_chain", txHash: null });
    expect(chain.state.sendCount).toBe(0);
  });

  it("records a reverted receipt as reverted, not settled", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps } = harness();
    await enqueueSettlements(deps);
    await submitSettlements(deps);
    chain.state.revertNext = true;
    chain.mine();
    await pollSettlementReceipts(deps);
    const settlement = await row(predictionId);
    expect(settlement.status).toBe("reverted");
    expect(settlement.confirmedAt).toBeNull();
  });

  it("requires the configured confirmations before confirming", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps } = harness({ RH_CONFIRMATIONS: "3" });
    await enqueueSettlements(deps);
    await submitSettlements(deps);
    chain.mine();
    await pollSettlementReceipts(deps);
    expect(await row(predictionId)).toMatchObject({ status: "submitted", confirmations: 1 });
    chain.mine(2);
    await pollSettlementReceipts(deps);
    expect(await row(predictionId)).toMatchObject({ status: "confirmed", confirmations: 3 });
  });

  it("a dropped transaction (nonce consumed elsewhere) is re-signed with a new nonce", async () => {
    const predictionId = await scoredPrediction();
    const { chain, deps, advance } = harness();
    await enqueueSettlements(deps);
    await submitSettlements(deps);
    const first = await row(predictionId);
    chain.dropAndConsumeNonce(first.txHash as Hash);

    await pollSettlementReceipts(deps); // within timeout: just pending
    expect((await row(predictionId)).status).toBe("submitted");
    advance(120_000);
    const result = await pollSettlementReceipts(deps);
    expect(result.dropped).toBe(1);
    expect(await row(predictionId)).toMatchObject({ status: "queued", txHash: null, lastErrorKind: "dropped" });

    await submitSettlements(deps);
    const second = await row(predictionId);
    expect(second.nonce).toBe(1);
    expect(second.txHash).not.toBe(first.txHash);
    chain.mine();
    await pollSettlementReceipts(deps);
    expect((await row(predictionId)).status).toBe("confirmed");
  });

  it("does nothing when settlement is disabled", async () => {
    await scoredPrediction();
    const chain = createSimulatedChain({ chainId: 46630 });
    const deps: SettlementDeps = { prisma, clients: createRobinhoodClients(loadRobinhoodChainConfig({}), chain.transport) };
    expect(await runSettlementTick(deps)).toEqual({ enabled: false });
    expect(await prisma.chainSettlement.count()).toBe(0);
  });

  it("the database rejects a confirmed settlement without a receipt", async () => {
    const predictionId = await scoredPrediction();
    await expect(
      prisma.chainSettlement.create({
        data: {
          predictionId,
          chainId: 46630,
          network: "testnet",
          kind: "resolution_attestation",
          status: "confirmed",
          payloadHash: "0x",
          calldata: "0x",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.chainSettlement.create({
        data: { predictionId, chainId: 4663, network: "testnet", kind: "x", status: "queued", payloadHash: "0x", calldata: "0x" },
      }),
    ).rejects.toThrow();
  });
});
