"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  connectWallet,
  disconnectWallet,
  isEthereumProvider,
  restoreWalletSession,
  type ConnectedProvider,
  type WalletId,
} from "@/lib/solana-wallet";

type WalletContextValue = {
  address: string | null;
  walletId: WalletId | null;
  connecting: boolean;
  error: string | null;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "vantage.wallet";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [provider, setProvider] = useState<ConnectedProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = useCallback((id: WalletId, next: ConnectedProvider, key: string) => {
    setWalletId(id);
    setProvider(next);
    setAddress(key);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const connect = useCallback(
    async (id: WalletId) => {
      setConnecting(true);
      setError(null);
      try {
        const result = await connectWallet(id);
        attach(id, result.provider, result.address);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not connect wallet";
        setError(message);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [attach],
  );

  const disconnect = useCallback(async () => {
    await disconnectWallet(provider);
    setAddress(null);
    setWalletId(null);
    setProvider(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [provider]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as WalletId | null;
    if (!saved) return;
    restoreWalletSession(saved)
      .then((session) => {
        if (!session) {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }
        attach(saved, session.provider, session.address);
      })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEY);
      });
  }, [attach]);

  useEffect(() => {
    if (!provider || !walletId) return;

    const clear = () => {
      setAddress(null);
      setWalletId(null);
      setProvider(null);
      window.localStorage.removeItem(STORAGE_KEY);
    };

    if (isEthereumProvider(provider)) {
      const onAccounts = (...args: unknown[]) => {
        const accounts = args[0] as string[] | undefined;
        if (!accounts?.[0]) {
          clear();
          return;
        }
        setAddress(accounts[0]);
      };
      provider.on?.("accountsChanged", onAccounts);
      provider.on?.("disconnect", clear);
      return () => {
        provider.removeListener?.("accountsChanged", onAccounts);
        provider.removeListener?.("disconnect", clear);
      };
    }

    const onAccount = (...args: unknown[]) => {
      const key = args[0] as { toBase58?: () => string; toString?: () => string } | null;
      if (!key) {
        clear();
        return;
      }
      setAddress(key.toBase58?.() ?? key.toString?.() ?? null);
    };
    provider.on?.("accountChanged", onAccount);
    provider.on?.("disconnect", clear);
    return () => {
      provider.off?.("accountChanged", onAccount);
      provider.off?.("disconnect", clear);
    };
  }, [provider, walletId]);

  const value = useMemo(
    () => ({
      address,
      walletId,
      connecting,
      error,
      connect,
      disconnect,
      clearError: () => setError(null),
    }),
    [address, walletId, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return ctx;
}
