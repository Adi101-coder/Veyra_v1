export type WalletChain = "solana" | "evm";

export type WalletTransaction = {
  hash: string;
  timestamp: number | null;
  status: "success" | "failed";
  direction: "in" | "out" | "self";
  counterparty: string | null;
  amountLabel: string;
  method: string;
  explorerUrl: string;
};

export type WalletActivity = {
  address: string;
  chain: WalletChain;
  /** Chain the rows were read from, e.g. "Polygon". */
  networkLabel: string;
  balanceLabel: string;
  explorerAddressUrl: string;
  transactions: WalletTransaction[];
};

export function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function explorerAddressUrl(chain: WalletChain, address: string) {
  return chain === "evm"
    ? `https://etherscan.io/address/${address}`
    : `https://solscan.io/account/${address}`;
}

export function formatTxTime(timestamp: number | null) {
  if (!timestamp) return "Unknown time";
  const delta = Date.now() - timestamp * 1000;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function fetchWalletActivity(address: string, chain: WalletChain, chainId?: number | null) {
  const params = new URLSearchParams({ address, chain });
  if (chainId != null) params.set("chainId", String(chainId));
  const response = await fetch(`/api/wallet/transactions?${params}`);
  const text = await response.text();
  let payload: WalletActivity & { error?: string };
  try {
    payload = JSON.parse(text) as WalletActivity & { error?: string };
  } catch {
    throw new Error(`Could not load transactions: the server is unavailable (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load transactions");
  }
  return payload as WalletActivity;
}
