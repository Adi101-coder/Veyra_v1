import {
  custom,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";

/**
 * In-memory EVM JSON-RPC node for tests. Not a mock of our own code: it validates
 * the signed bytes we send (signature recovery, chain id, nonce ordering) the way a
 * real node would, and exposes knobs to inject the failures the settlement worker
 * must survive. Test-only; never imported by application code.
 */

type Mined = { hash: Hash; blockNumber: bigint; status: "success" | "reverted"; from: Address; to: Address | null; nonce: number };

export class RpcFailure extends Error {
  constructor(
    message: string,
    readonly code = -32000,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function createSimulatedChain(options: { chainId: number; balanceWei?: bigint; baseFeeWei?: bigint }) {
  const state = {
    chainId: options.chainId,
    head: 1_000n,
    baseFee: options.baseFeeWei ?? 10_000_000n, // 0.01 gwei
    priorityFee: 1_000_000n,
    balances: new Map<string, bigint>(),
    minedNonce: new Map<string, number>(),
    mempool: new Map<Hash, { raw: Hex; from: Address; to: Address | null; nonce: number }>(),
    mined: new Map<Hash, Mined>(),
    rawByHash: new Map<Hash, Hex>(),
    sendCount: 0,
    calls: [] as string[],
    failNext: new Map<string, RpcFailure>(),
    revertNext: false,
    defaultBalance: options.balanceWei ?? 10n ** 18n,
    contractReturn: "0x" as Hex,
  };

  const balanceOf = (address: string) => state.balances.get(address.toLowerCase()) ?? state.defaultBalance;
  const nonceOf = (address: string) => state.minedNonce.get(address.toLowerCase()) ?? 0;

  async function handle(method: string, params: unknown[] = []): Promise<unknown> {
    state.calls.push(method);
    const failure = state.failNext.get(method);
    if (failure) {
      state.failNext.delete(method);
      throw failure;
    }
    switch (method) {
      case "eth_chainId":
        return numberToHex(state.chainId);
      case "eth_blockNumber":
        return numberToHex(state.head);
      case "eth_getBlockByNumber":
        return {
          number: numberToHex(state.head),
          hash: keccak256(numberToHex(state.head)),
          parentHash: keccak256(numberToHex(state.head - 1n)),
          timestamp: numberToHex(1_789_000_000n + state.head),
          baseFeePerGas: numberToHex(state.baseFee),
          gasLimit: numberToHex(30_000_000n),
          gasUsed: "0x0",
          transactions: [],
        };
      case "eth_maxPriorityFeePerGas":
        return numberToHex(state.priorityFee);
      case "eth_gasPrice":
        return numberToHex(state.baseFee + state.priorityFee);
      case "eth_getBalance":
        return numberToHex(balanceOf(params[0] as string));
      case "eth_getTransactionCount": {
        const address = (params[0] as string).toLowerCase();
        const mined = nonceOf(address);
        if (params[1] !== "pending") return numberToHex(mined);
        const pending = [...state.mempool.values()].filter((tx) => tx.from.toLowerCase() === address).length;
        return numberToHex(mined + pending);
      }
      case "eth_estimateGas":
        return numberToHex(25_000n);
      case "eth_call":
        return state.contractReturn;
      case "eth_sendRawTransaction": {
        const raw = params[0] as Hex;
        const hash = keccak256(raw);
        if (state.mined.has(hash) || state.mempool.has(hash)) throw new RpcFailure("already known");
        const tx = parseTransaction(raw);
        if (tx.chainId !== state.chainId) throw new RpcFailure(`invalid chain id ${tx.chainId}`);
        const from = await recoverTransactionAddress({ serializedTransaction: raw as never });
        if ((tx.nonce ?? 0) < nonceOf(from)) throw new RpcFailure("nonce too low");
        const cost = (tx.gas ?? 0n) * (tx.maxFeePerGas ?? 0n) + (tx.value ?? 0n);
        if (balanceOf(from) < cost) throw new RpcFailure("insufficient funds for gas * price + value");
        state.mempool.set(hash, { raw, from, to: tx.to ?? null, nonce: tx.nonce ?? 0 });
        state.rawByHash.set(hash, raw);
        state.sendCount += 1;
        return hash;
      }
      case "eth_getTransactionReceipt": {
        const mined = state.mined.get(params[0] as Hash);
        if (!mined) return null;
        return {
          transactionHash: mined.hash,
          transactionIndex: "0x0",
          blockHash: keccak256(numberToHex(mined.blockNumber)),
          blockNumber: numberToHex(mined.blockNumber),
          from: mined.from,
          to: mined.to,
          cumulativeGasUsed: numberToHex(21_000n),
          gasUsed: numberToHex(21_000n),
          effectiveGasPrice: numberToHex(state.baseFee + state.priorityFee),
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"0".repeat(512)}`,
          status: mined.status === "success" ? "0x1" : "0x0",
          type: "0x2",
        };
      }
      default:
        throw new RpcFailure(`method ${method} not supported`, -32601);
    }
  }

  return {
    state,
    transport: custom({ request: ({ method, params }) => handle(method, params as unknown[]) }),
    /** Mines every mempool transaction (in nonce order) into a new block. */
    mine(blocks = 1) {
      state.head += 1n;
      const pending = [...state.mempool.entries()].sort((a, b) => a[1].nonce - b[1].nonce);
      for (const [hash, tx] of pending) {
        if (tx.nonce !== nonceOf(tx.from)) continue;
        state.mempool.delete(hash);
        state.minedNonce.set(tx.from.toLowerCase(), tx.nonce + 1);
        state.mined.set(hash, {
          hash,
          blockNumber: state.head,
          status: state.revertNext ? "reverted" : "success",
          from: tx.from,
          to: tx.to,
          nonce: tx.nonce,
        });
        state.revertNext = false;
      }
      state.head += BigInt(blocks - 1);
    },
    /** Evicts a transaction and burns its nonce with another transaction (a drop/replacement). */
    dropAndConsumeNonce(hash: Hash) {
      const tx = state.mempool.get(hash);
      if (!tx) throw new Error("not in mempool");
      state.mempool.delete(hash);
      state.minedNonce.set(tx.from.toLowerCase(), tx.nonce + 1);
      state.head += 1n;
    },
    failOnce(method: string, failure: RpcFailure) {
      state.failNext.set(method, failure);
    },
    setBalance(address: string, wei: bigint) {
      state.balances.set(address.toLowerCase(), wei);
    },
  };
}
