import "server-only";

import {
  BaseError,
  createPublicClient,
  http,
  keccak256,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type Transport,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type LocalAccount } from "viem/accounts";
import type { RobinhoodChainConfig } from "@/server/chain/config";

/**
 * Robinhood Chain RPC access over viem. Reads, fees, nonces and receipts go
 * through the public client; transactions are signed locally by a LocalAccount
 * and broadcast as raw bytes, so a retry can resend the exact same transaction
 * (same hash) instead of creating a second one.
 */
export type RobinhoodClients = {
  config: RobinhoodChainConfig;
  publicClient: PublicClient;
  account: LocalAccount | null;
};

export function createRobinhoodClients(config: RobinhoodChainConfig, transport?: Transport): RobinhoodClients {
  const publicClient = createPublicClient({
    chain: config.chain,
    // Confirmation counts and nonce checks must see the current head, not a cached one.
    cacheTime: 0,
    transport: transport ?? http(config.rpcUrl, { timeout: 10_000, retryCount: 2 }),
  }) as PublicClient;
  return {
    config,
    publicClient,
    account: config.settlementPrivateKey ? privateKeyToAccount(config.settlementPrivateKey) : null,
  };
}

export type ChainErrorKind =
  | "insufficient_funds"
  | "nonce_too_low"
  | "replacement_underpriced"
  | "already_known"
  | "rate_limited"
  | "timeout"
  | "wrong_chain"
  | "fee_cap_exceeded"
  | "network"
  | "unknown";

export class ChainError extends Error {
  constructor(
    readonly kind: ChainErrorKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/** Maps RPC/viem failures to a small vocabulary the settlement worker can act on. */
export function classifyChainError(error: unknown): ChainError {
  if (error instanceof ChainError) return error;
  const text = [
    error instanceof BaseError ? error.shortMessage : "",
    error instanceof BaseError ? error.details : "",
    error instanceof Error ? error.message : String(error),
  ]
    .join(" ")
    .toLowerCase();
  const status = (error as { status?: number })?.status;
  if (text.includes("insufficient funds")) return new ChainError("insufficient_funds", "Settlement signer has insufficient ETH for gas.", true);
  if (text.includes("already known") || text.includes("known transaction")) return new ChainError("already_known", "Transaction already in the mempool.", false);
  if (text.includes("nonce too low") || text.includes("nonce has already been used")) return new ChainError("nonce_too_low", "Nonce already used.", false);
  if (text.includes("replacement transaction underpriced") || text.includes("underpriced")) return new ChainError("replacement_underpriced", "Replacement transaction underpriced.", true);
  if (status === 429 || text.includes("429") || text.includes("rate limit") || text.includes("too many requests")) return new ChainError("rate_limited", "Robinhood Chain RPC rate limited.", true);
  if (text.includes("timed out") || text.includes("timeout")) return new ChainError("timeout", "Robinhood Chain RPC timed out.", true);
  if (text.includes("fetch failed") || text.includes("econnrefused") || text.includes("http request failed") || text.includes("network")) {
    return new ChainError("network", "Robinhood Chain RPC unreachable.", true);
  }
  return new ChainError("unknown", error instanceof Error ? error.message.slice(0, 300) : "Unknown chain error", false);
}

/** Refuses to operate if the RPC serves a different chain than configured. */
export async function assertRpcChain(clients: RobinhoodClients) {
  let chainId: number;
  try {
    chainId = await clients.publicClient.getChainId();
  } catch (error) {
    throw classifyChainError(error);
  }
  if (chainId !== clients.config.chain.id) {
    throw new ChainError(
      "wrong_chain",
      `RPC reports chain ${chainId}, expected Robinhood Chain ${clients.config.network} (${clients.config.chain.id}).`,
      false,
    );
  }
  return chainId;
}

export async function getRpcStatus(clients: RobinhoodClients) {
  const started = Date.now();
  try {
    const chainId = await assertRpcChain(clients);
    const blockNumber = await clients.publicClient.getBlockNumber();
    return { ok: true as const, chainId, blockNumber, latencyMs: Date.now() - started };
  } catch (error) {
    const classified = classifyChainError(error);
    return { ok: false as const, error: classified.kind, message: classified.message, latencyMs: Date.now() - started };
  }
}

export async function getNativeBalance(clients: RobinhoodClients, address: Address) {
  try {
    return await clients.publicClient.getBalance({ address });
  } catch (error) {
    throw classifyChainError(error);
  }
}

export async function readRobinhoodContract(
  clients: RobinhoodClients,
  params: Parameters<PublicClient["readContract"]>[0],
): Promise<unknown> {
  try {
    return await clients.publicClient.readContract(params);
  } catch (error) {
    throw classifyChainError(error);
  }
}

export type SignedTransaction = {
  hash: Hash;
  raw: Hex;
  nonce: number;
  from: Address;
  to: Address;
  maxFeePerGas: bigint;
  gas: bigint;
};

/**
 * Prepares (nonce, EIP-1559 fees, gas) and signs a transaction locally without
 * broadcasting it. The caller persists `raw`/`hash` before calling `broadcast`.
 */
export async function signTransaction(
  clients: RobinhoodClients,
  request: { to: Address; data?: Hex; value?: bigint },
): Promise<SignedTransaction> {
  const account = clients.account;
  if (!account) throw new ChainError("unknown", "No Robinhood Chain signer configured.", false);
  await assertRpcChain(clients);
  try {
    const nonce = await clients.publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    const fees = await clients.publicClient.estimateFeesPerGas();
    if (fees.maxFeePerGas > clients.config.maxFeePerGasWei) {
      throw new ChainError("fee_cap_exceeded", "Robinhood Chain gas price is above RH_MAX_FEE_GWEI.", true);
    }
    const value = request.value ?? 0n;
    const gasEstimate = await clients.publicClient.estimateGas({
      account: account.address,
      to: request.to,
      data: request.data,
      value,
    });
    const gas = (gasEstimate * 12n) / 10n; // 20% headroom for L1 data cost drift
    const balance = await clients.publicClient.getBalance({ address: account.address });
    if (balance < gas * fees.maxFeePerGas + value) {
      throw new ChainError("insufficient_funds", "Settlement signer has insufficient ETH for gas.", true);
    }
    const raw = await account.signTransaction({
      chainId: clients.config.chain.id,
      type: "eip1559",
      to: request.to,
      data: request.data,
      value,
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    return { hash: keccak256(raw), raw, nonce, from: account.address, to: request.to, maxFeePerGas: fees.maxFeePerGas, gas };
  } catch (error) {
    throw classifyChainError(error);
  }
}

/** Broadcasts a signed transaction. Resending the same bytes is idempotent. */
export async function broadcast(clients: RobinhoodClients, signed: { raw: Hex; hash: Hash }) {
  try {
    const hash = await clients.publicClient.sendRawTransaction({ serializedTransaction: signed.raw });
    if (hash.toLowerCase() !== signed.hash.toLowerCase()) {
      throw new ChainError("unknown", "RPC returned an unexpected transaction hash.", false);
    }
    return hash;
  } catch (error) {
    const classified = classifyChainError(error);
    // The node already has these exact bytes: that is success, not a failure.
    if (classified.kind === "already_known") return signed.hash;
    throw classified;
  }
}

export type ReceiptStatus =
  | { state: "pending" }
  | { state: "confirming"; receipt: TransactionReceipt; confirmations: number }
  | { state: "confirmed"; receipt: TransactionReceipt; confirmations: number }
  | { state: "reverted"; receipt: TransactionReceipt };

/** One receipt poll (the worker calls this repeatedly; no long-lived waits in requests). */
export async function pollReceipt(clients: RobinhoodClients, hash: Hash): Promise<ReceiptStatus> {
  let receipt: TransactionReceipt;
  try {
    receipt = await clients.publicClient.getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof BaseError && error.name === "TransactionReceiptNotFoundError") return { state: "pending" };
    const classified = classifyChainError(error);
    if (classified.kind === "unknown" && /could not be found|not found/i.test(classified.message)) return { state: "pending" };
    throw classified;
  }
  if (receipt.status === "reverted") return { state: "reverted", receipt };
  const head = await clients.publicClient.getBlockNumber();
  const confirmations = Number(head - receipt.blockNumber + 1n);
  return confirmations >= clients.config.confirmations
    ? { state: "confirmed", receipt, confirmations }
    : { state: "confirming", receipt, confirmations };
}

/** Nonce the chain has already mined for the signer (used to detect dropped transactions). */
export async function minedNonce(clients: RobinhoodClients, address: Address) {
  try {
    return await clients.publicClient.getTransactionCount({ address, blockTag: "latest" });
  } catch (error) {
    throw classifyChainError(error);
  }
}
