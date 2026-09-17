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
  walletChain,
  restoreWalletSession,
  type ConnectedProvider,
  type WalletId,
  signSessionMessage,
} from "@/lib/solana-wallet";
import { registerSessionEnsurer } from "@/lib/betting-api";
import {
  fetchWalletActivity,
  type WalletActivity,
  type WalletChain,
} from "@/lib/wallet-activity";

type ActivityState = {
  status: "idle" | "loading" | "ready" | "error";
  data: WalletActivity | null;
  error: string | null;
};

type WalletContextValue = {
  address: string | null;
  walletId: WalletId | null;
  chain: WalletChain | null;
  connecting: boolean;
  error: string | null;
  activity: ActivityState;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  clearError: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "vantage.wallet";
const idleActivity: ActivityState = { status: "idle", data: null, error: null };

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [provider, setProvider] = useState<ConnectedProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityState>(idleActivity);

  const chain = walletId ? walletChain(walletId) : null;

  // Server session: writes sign in lazily (first 401) with a one-time nonce signature.
  useEffect(() => {
    if (!provider || !address) {
      registerSessionEnsurer(null);
      return;
    }
    let pending: Promise<void> | null = null;
    registerSessionEnsurer(() => {
      pending ??= (async () => {
        const nonceResponse = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
        const nonce = (await nonceResponse.json()) as { nonce?: string; message?: string; error?: { message?: string } };
        if (!nonceResponse.ok || !nonce.nonce || !nonce.message) {
          throw new Error(nonce.error?.message ?? "Could not start wallet sign-in");
        }
        const signature = await signSessionMessage(provider, address, nonce.message);
        const verify = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: address, nonce: nonce.nonce, signature }),
        });
        if (!verify.ok) {
          const body = (await verify.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Wallet sign-in failed");
        }
      })().finally(() => {
        pending = null;
      });
      return pending;
    });
    // A session for a different wallet (account switch) must not be reused.
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ walletAddress: string | null }>)
      .then((session) => {
        const normalized = address.startsWith("0x") ? address.toLowerCase() : address;
        if (session.walletAddress && session.walletAddress !== normalized) {
          return fetch("/api/auth/logout", { method: "POST" });
        }
      })
      .catch(() => undefined);
    return () => registerSessionEnsurer(null);
  }, [provider, address]);

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
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAddress(null);
    setWalletId(null);
    setProvider(null);
    setActivity(idleActivity);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [provider]);

  const refreshActivity = useCallback(async () => {
    if (!address || !chain) {
      setActivity(idleActivity);
      return;
    }
    setActivity((prev) => ({
      status: "loading",
      data: prev.data,
      error: null,
    }));
    try {
      const data = await fetchWalletActivity(address, chain);
      setActivity({ status: "ready", data, error: null });
    } catch (err) {
      setActivity({
        status: "error",
        data: null,
        error: err instanceof Error ? err.message : "Could not load transactions",
      });
    }
  }, [address, chain]);

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
      setActivity(idleActivity);
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

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const value = useMemo(
    () => ({
      address,
      walletId,
      chain,
      connecting,
      error,
      activity,
      connect,
      disconnect,
      refreshActivity,
      clearError: () => setError(null),
    }),
    [
      address,
      walletId,
      chain,
      connecting,
      error,
      activity,
      connect,
      disconnect,
      refreshActivity,
    ],
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
