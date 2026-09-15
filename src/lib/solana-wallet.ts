export type WalletId =
  | "binance"
  | "metamask"
  | "solflare"
  | "phantom"
  | "backpack"
  | "coinbase";

export type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isCoinbaseWallet?: boolean;
  publicKey?: { toBase58(): string; toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBase58(): string; toString(): string };
  }>;
  disconnect: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type InjectedEthereumProvider = {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isBinance?: boolean;
  isBinanceWallet?: boolean;
  providers?: InjectedEthereumProvider[];
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type ConnectedProvider = InjectedSolanaProvider | InjectedEthereumProvider;

declare global {
  interface Window {
    solana?: InjectedSolanaProvider;
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    backpack?: InjectedSolanaProvider;
    coinbaseSolana?: InjectedSolanaProvider;
    ethereum?: InjectedEthereumProvider;
    BinanceChain?: InjectedEthereumProvider;
    binancew3w?: { ethereum?: InjectedEthereumProvider };
  }
}

export const WALLET_OPTIONS: {
  id: WalletId;
  name: string;
  url: string;
  hint: string;
}[] = [
  {
    id: "binance",
    name: "Binance Wallet",
    url: "https://www.binance.com/en/web3wallet",
    hint: "Ethereum",
  },
  {
    id: "metamask",
    name: "MetaMask",
    url: "https://metamask.io/download/",
    hint: "Ethereum",
  },
  {
    id: "solflare",
    name: "Solflare",
    url: "https://solflare.com/download",
    hint: "Solana",
  },
  {
    id: "phantom",
    name: "Phantom",
    url: "https://phantom.app/download",
    hint: "Solana",
  },
  {
    id: "backpack",
    name: "Backpack",
    url: "https://backpack.app/download",
    hint: "Solana",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    url: "https://www.coinbase.com/wallet/downloads",
    hint: "Solana",
  },
];

export function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function publicKeyToString(key: { toBase58?: () => string; toString(): string }) {
  return key.toBase58?.() ?? key.toString();
}

export function isEthereumProvider(
  provider: ConnectedProvider,
): provider is InjectedEthereumProvider {
  return "request" in provider && typeof provider.request === "function";
}

export function getMetaMaskProvider(): InjectedEthereumProvider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const eth = window.ethereum;
  const list = eth.providers?.length ? eth.providers : [eth];
  return list.find((item) => item.isMetaMask && !item.isPhantom) ?? null;
}

export function getBinanceProvider(): InjectedEthereumProvider | null {
  if (typeof window === "undefined") return null;
  if (window.BinanceChain?.request) return window.BinanceChain;
  if (window.binancew3w?.ethereum?.request) return window.binancew3w.ethereum;
  if (!window.ethereum) return null;
  const eth = window.ethereum;
  const list = eth.providers?.length ? eth.providers : [eth];
  return list.find((item) => item.isBinance || item.isBinanceWallet) ?? null;
}

export function isEvmWallet(id: WalletId) {
  return id === "metamask" || id === "binance";
}

export function walletChain(id: WalletId): "solana" | "evm" {
  return isEvmWallet(id) ? "evm" : "solana";
}

export function getInjectedProvider(id: WalletId): ConnectedProvider | null {
  if (typeof window === "undefined") return null;

  if (id === "metamask") return getMetaMaskProvider();
  if (id === "binance") return getBinanceProvider();
  if (id === "phantom") {
    return window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null);
  }
  if (id === "solflare") {
    return window.solflare ?? (window.solana?.isSolflare ? window.solana : null);
  }
  if (id === "backpack") {
    return window.backpack ?? (window.solana?.isBackpack ? window.solana : null);
  }
  return window.coinbaseSolana ?? null;
}

export function isWalletAvailable(id: WalletId) {
  return Boolean(getInjectedProvider(id));
}

export async function connectWallet(id: WalletId): Promise<{
  address: string;
  provider: ConnectedProvider;
}> {
  const provider = getInjectedProvider(id);
  const meta = WALLET_OPTIONS.find((item) => item.id === id);

  if (!provider) {
    if (meta) window.open(meta.url, "_blank", "noopener,noreferrer");
    throw new Error(`${meta?.name ?? "Wallet"} is not installed`);
  }

  if (isEvmWallet(id) && isEthereumProvider(provider)) {
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    const address = accounts[0];
    if (!address) throw new Error(`${meta?.name ?? "Wallet"} returned no account`);
    return { address, provider };
  }

  const solana = provider as InjectedSolanaProvider;
  const response = await solana.connect();
  const address = publicKeyToString(response.publicKey ?? solana.publicKey!);
  return { address, provider };
}

export async function restoreWalletSession(id: WalletId): Promise<{
  address: string;
  provider: ConnectedProvider;
} | null> {
  const provider = getInjectedProvider(id);
  if (!provider) return null;

  if (isEvmWallet(id) && isEthereumProvider(provider)) {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    if (!accounts[0]) return null;
    return { address: accounts[0], provider };
  }

  const solana = provider as InjectedSolanaProvider;
  const response = await solana.connect({ onlyIfTrusted: true });
  const address = publicKeyToString(response.publicKey ?? solana.publicKey!);
  return { address, provider };
}

export async function disconnectWallet(provider: ConnectedProvider | null) {
  if (!provider) return;
  if (isEthereumProvider(provider)) return;
  if (typeof provider.disconnect === "function") {
    await provider.disconnect();
  }
}
