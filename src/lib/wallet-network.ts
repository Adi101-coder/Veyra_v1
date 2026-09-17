import type { Chain } from "viem";
import { addChainParams, toHexChainId } from "@/lib/robinhood-chain";

/** Minimal EIP-1193 surface used for network detection and switching. */
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export class WalletNetworkError extends Error {
  constructor(
    message: string,
    readonly code: "USER_REJECTED" | "PENDING_REQUEST" | "UNSUPPORTED" | "FAILED",
  ) {
    super(message);
    this.name = "WalletNetworkError";
  }
}

function rpcCode(error: unknown) {
  const candidate = error as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  const code = candidate?.code ?? candidate?.data?.originalError?.code;
  return typeof code === "number" ? code : null;
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readWalletChainId(provider: Eip1193Provider) {
  return parseChainId(await provider.request({ method: "eth_chainId" }));
}

function translate(error: unknown): WalletNetworkError {
  const code = rpcCode(error);
  if (code === 4001) return new WalletNetworkError("Network switch was rejected in the wallet.", "USER_REJECTED");
  if (code === -32002) return new WalletNetworkError("A wallet request is already pending. Open your wallet.", "PENDING_REQUEST");
  const message = error instanceof Error ? error.message : "Could not switch network.";
  return new WalletNetworkError(message, "FAILED");
}

/**
 * Switches an injected EVM wallet to the given Robinhood Chain network. If the
 * wallet does not know the chain (EIP-3326 error 4902), it is added with the
 * official public parameters (EIP-3085) and then selected.
 */
export async function switchWalletToChain(provider: Eip1193Provider, chain: Chain) {
  const chainId = toHexChainId(chain.id);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = rpcCode(error);
    const unknownChain =
      code === 4902 || (error instanceof Error && /unrecognized chain|unknown chain|not been added/i.test(error.message));
    if (!unknownChain) throw translate(error);
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [addChainParams(chain)] });
    } catch (addError) {
      throw translate(addError);
    }
  }
  const current = await readWalletChainId(provider).catch(() => null);
  if (current !== chain.id) {
    throw new WalletNetworkError(`Wallet is still on chain ${current ?? "unknown"}.`, "FAILED");
  }
  return current;
}
