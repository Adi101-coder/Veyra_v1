import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { encodeAbiParameters, keccak256, type Address, type Hash, type Hex } from "viem";
import {
  broadcast,
  classifyChainError,
  minedNonce,
  pollReceipt,
  signTransaction,
  type RobinhoodClients,
} from "@/server/chain/client";

/**
 * Robinhood Chain settlement references.
 *
 * No contract is involved: Veyra positions are Polymarket shares on Polygon and all
 * prediction/reputation logic is off-chain. When a prediction is scored at market
 * resolution, the settlement signer sends a zero-value transaction to itself whose
 * input data is the ABI-encoded settlement summary. The prediction is then linked to
 * that transaction hash, and anyone can re-derive the payload hash from the
 * explorer.
 *
 * Lifecycle (one row per prediction/chain/kind, unique):
 *   queued -> signing -> signed -> submitted -> confirmed | reverted
 *                 \-> queued (retryable error, backoff) -> failed (attempts exhausted)
 *   submitted with nonce mined by another tx -> queued (dropped; re-signed)
 * The signed raw bytes are persisted before broadcast, so a crash or retry resends
 * the same transaction (same hash) and can never create a duplicate settlement.
 */

export const SETTLEMENT_KIND = "resolution_attestation";
export const SETTLEMENT_TAG = "veyra.settlement.v1";

const SETTLEMENT_ABI = [
  { name: "tag", type: "string" },
  { name: "predictionId", type: "string" },
  { name: "marketId", type: "string" },
  { name: "walletAddress", type: "string" },
  { name: "predictedOutcome", type: "string" },
  { name: "resolvedOutcome", type: "string" },
  { name: "confidenceBps", type: "uint16" },
  { name: "correct", type: "bool" },
  { name: "costMicros", type: "uint256" },
  { name: "pnlMicros", type: "int256" },
  { name: "brierMicros", type: "uint256" },
  { name: "resolvedAt", type: "uint64" },
] as const;

export type SettlementScore = {
  predictionId: string;
  marketId: string;
  walletAddress: string;
  predictedOutcome: string;
  resolvedOutcome: string;
  confidenceBps: number;
  correct: boolean;
  notionalMicros: bigint;
  pnlMicros: bigint;
  brierMicros: bigint;
  resolvedAt: Date;
};

export function encodeSettlementPayload(score: SettlementScore) {
  const calldata = encodeAbiParameters(SETTLEMENT_ABI, [
    SETTLEMENT_TAG,
    score.predictionId,
    score.marketId,
    score.walletAddress,
    score.predictedOutcome,
    score.resolvedOutcome,
    score.confidenceBps,
    score.correct,
    score.notionalMicros,
    score.pnlMicros,
    score.brierMicros,
    BigInt(Math.floor(score.resolvedAt.getTime() / 1000)),
  ]);
  return { calldata, payloadHash: keccak256(calldata) };
}

export type SettlementDeps = {
  prisma: PrismaClient;
  clients: RobinhoodClients;
  now?: () => Date;
};

const LEASE_MS = 5 * 60 * 1000;

function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.max(0, attempts - 1));
}

/** Creates a queued settlement for every scored prediction that lacks one on this chain. */
export async function enqueueSettlements({ prisma, clients }: SettlementDeps, limit = 200) {
  const chainId = clients.config.chain.id;
  const scores = await prisma.predictionScore.findMany({
    where: { prediction: { chainSettlements: { none: { chainId, kind: SETTLEMENT_KIND } } } },
    orderBy: { resolvedAt: "asc" },
    take: limit,
  });
  let created = 0;
  for (const score of scores) {
    const { calldata, payloadHash } = encodeSettlementPayload(score);
    try {
      await prisma.chainSettlement.create({
        data: {
          predictionId: score.predictionId,
          chainId,
          network: clients.config.network,
          kind: SETTLEMENT_KIND,
          status: "queued",
          payloadHash,
          calldata,
        },
      });
      created += 1;
    } catch (error) {
      // Unique (predictionId, chainId, kind): another worker created it first.
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }
  return created;
}

/** Recovers rows a crashed worker left in "signing" (nothing was broadcast). */
async function reclaimStaleSigning({ prisma, now }: SettlementDeps) {
  const cutoff = new Date((now?.() ?? new Date()).getTime() - LEASE_MS);
  const { count } = await prisma.chainSettlement.updateMany({
    where: { status: "signing", claimedAt: { lt: cutoff } },
    data: { status: "queued", claimToken: null, claimedAt: null },
  });
  return count;
}

/**
 * Signs and broadcasts queued settlements one at a time (nonces are sequential for
 * the single signer). Returns how many were broadcast.
 */
export async function submitSettlements(deps: SettlementDeps, limit = 20) {
  const { prisma, clients } = deps;
  const now = () => deps.now?.() ?? new Date();
  if (!clients.config.settlementEnabled || !clients.account) return 0;
  await reclaimStaleSigning(deps);
  // Signed-but-unbroadcast bytes hold a nonce the node does not know about yet.
  // Signing another transaction now would reuse it, so wait for the poller.
  const unsent = await prisma.chainSettlement.count({
    where: { chainId: clients.config.chain.id, status: { in: ["signed", "signing"] } },
  });
  if (unsent > 0) return 0;

  let submitted = 0;
  for (let i = 0; i < limit; i += 1) {
    const candidate = await prisma.chainSettlement.findFirst({
      where: {
        chainId: clients.config.chain.id,
        status: "queued",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now() } }],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) break;
    const claimToken = randomUUID();
    const { count } = await prisma.chainSettlement.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: { status: "signing", claimToken, claimedAt: now() },
    });
    if (count !== 1) continue;

    let signed;
    try {
      signed = await signTransaction(clients, {
        to: clients.account.address,
        data: candidate.calldata as Hex,
        value: 0n,
      });
    } catch (error) {
      const failure = classifyChainError(error);
      const attempts = candidate.attempts + 1;
      const exhausted = !failure.retryable || attempts >= clients.config.maxAttempts;
      await prisma.chainSettlement.update({
        where: { id: candidate.id },
        data: {
          status: exhausted ? "failed" : "queued",
          attempts,
          lastErrorKind: failure.kind,
          lastError: failure.message,
          nextAttemptAt: exhausted ? null : new Date(now().getTime() + backoffMs(attempts)),
          claimToken: null,
          claimedAt: null,
        },
      });
      // A wrong-chain RPC or exhausted funds affects every row: stop this pass.
      if (failure.kind === "wrong_chain" || failure.kind === "insufficient_funds" || failure.kind === "fee_cap_exceeded") break;
      continue;
    }

    // Persist the exact signed bytes before they leave the process.
    await prisma.chainSettlement.update({
      where: { id: candidate.id },
      data: {
        status: "signed",
        txHash: signed.hash,
        rawTx: signed.raw,
        nonce: signed.nonce,
        fromAddress: signed.from,
        toAddress: signed.to,
        gasLimit: signed.gas.toString(),
        maxFeePerGasWei: signed.maxFeePerGas.toString(),
        attempts: candidate.attempts + 1,
      },
    });
    const sent = await sendSigned(deps, { id: candidate.id, raw: signed.raw, hash: signed.hash });
    if (!sent) break;
    submitted += 1;
  }
  return submitted;
}

async function sendSigned(deps: SettlementDeps, row: { id: string; raw: Hex; hash: Hash }) {
  const now = deps.now?.() ?? new Date();
  try {
    await broadcast(deps.clients, row);
    await deps.prisma.chainSettlement.update({
      where: { id: row.id },
      data: { status: "submitted", submittedAt: now, lastErrorKind: null, lastError: null },
    });
    return true;
  } catch (error) {
    const failure = classifyChainError(error);
    // Stay "signed": the receipt poller rebroadcasts the same bytes or detects a drop.
    await deps.prisma.chainSettlement.update({
      where: { id: row.id },
      data: { lastErrorKind: failure.kind, lastError: failure.message },
    });
    return false;
  }
}

/**
 * Advances signed/submitted settlements from receipts. Only a mined receipt with
 * enough confirmations sets "confirmed"; broadcast alone never does.
 */
export async function pollSettlementReceipts(deps: SettlementDeps, limit = 100) {
  const { prisma, clients } = deps;
  const now = () => deps.now?.() ?? new Date();
  const rows = await prisma.chainSettlement.findMany({
    where: { chainId: clients.config.chain.id, status: { in: ["signed", "submitted"] } },
    orderBy: { nonce: "asc" },
    take: limit,
  });
  const result = { confirmed: 0, reverted: 0, pending: 0, rebroadcast: 0, dropped: 0 };
  for (const row of rows) {
    const hash = row.txHash as Hash;
    let status;
    try {
      status = await pollReceipt(clients, hash);
    } catch (error) {
      const failure = classifyChainError(error);
      await prisma.chainSettlement.update({
        where: { id: row.id },
        data: { lastErrorKind: failure.kind, lastError: failure.message },
      });
      result.pending += 1;
      continue;
    }

    if (status.state === "confirmed" || status.state === "reverted" || status.state === "confirming") {
      const receipt = status.receipt;
      const final = status.state === "confirmed" ? "confirmed" : status.state === "reverted" ? "reverted" : "submitted";
      await prisma.chainSettlement.update({
        where: { id: row.id },
        data: {
          status: final,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          gasUsed: receipt.gasUsed,
          effectiveGasPriceWei: receipt.effectiveGasPrice?.toString() ?? null,
          confirmations: status.state === "reverted" ? 0 : status.confirmations,
          confirmedAt: final === "confirmed" ? now() : null,
          lastErrorKind: final === "reverted" ? "reverted" : null,
          lastError: final === "reverted" ? "Settlement transaction reverted." : null,
        },
      });
      if (final === "confirmed") result.confirmed += 1;
      else if (final === "reverted") result.reverted += 1;
      else result.pending += 1;
      continue;
    }

    // No receipt yet.
    const sentAt = row.submittedAt ?? row.updatedAt;
    const waited = now().getTime() - sentAt.getTime();
    if (row.status === "signed" || waited > clients.config.receiptTimeoutMs) {
      // Our nonce mined by something else means this tx can never be included.
      const mined = await minedNonce(clients, row.fromAddress as Address).catch(() => null);
      if (mined != null && row.nonce != null && mined > row.nonce) {
        const recheck = await pollReceipt(clients, hash).catch(() => ({ state: "pending" as const }));
        if (recheck.state === "pending") {
          await prisma.chainSettlement.update({
            where: { id: row.id },
            data: {
              status: "queued",
              txHash: null,
              rawTx: null,
              nonce: null,
              submittedAt: null,
              lastErrorKind: "dropped",
              lastError: `Transaction ${hash} was dropped (nonce ${row.nonce} used by another transaction).`,
            },
          });
          result.dropped += 1;
          continue;
        }
      }
      await sendSigned(deps, { id: row.id, raw: row.rawTx as Hex, hash });
      result.rebroadcast += 1;
      continue;
    }
    result.pending += 1;
  }
  return result;
}

export async function runSettlementTick(deps: SettlementDeps) {
  if (!deps.clients.config.settlementEnabled) {
    return { enabled: false as const };
  }
  const enqueued = await enqueueSettlements(deps);
  // Receipts first: rebroadcast or resolve anything signed before signing new nonces.
  const receipts = await pollSettlementReceipts(deps);
  const submitted = await submitSettlements(deps);
  return { enabled: true as const, enqueued, submitted, receipts };
}
