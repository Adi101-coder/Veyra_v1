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
import { isRobinhoodChainId, publicRobinhoodChain } from "@/lib/robinhood-chain";
import { parseChainId, readWalletChainId, switchWalletToChain } from "@/lib/wallet-network";
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
  /** EVM wallets only: the wallet's current chain id (null for Solana / unknown). */
  networkChainId: number | null;
  robinhoodChain: { id: number; name: string };
  onRobinhoodChain: boolean;
  switchingNetwork: boolean;
  switchToRobinhoodChain: () => Promise<void>;
  /** True while the one-time wallet sign-in signature (nonce → sign → verify) runs. */
  signingIn: boolean;
  /** Message from the last failed wallet sign-in; cleared when a new one starts. */
  signInError: string | null;
  /** Whether the server holds a verified session for the connected wallet. */
  hasSession: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "vantage.wallet";
type SessionState = {
  address: string | null;
  signingIn: boolean;
  signInError: string | null;
  hasSession: boolean;
};

const idleActivity: ActivityState = { status: "idle", data: null, error: null };

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [provider, setProvider] = useState<ConnectedProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityState>(idleActivity);
  // Sign-in state is keyed by wallet address so an account switch reads as "no session".
  const [sessionState, setSessionState] = useState<SessionState>({
    address: null,
    signingIn: false,
    signInError: null,
    hasSession: false,
  });
  const sessionCurrent = sessionState.address !== null && sessionState.address === address;
  const signingIn = sessionCurrent && sessionState.signingIn;
  const signInError = sessionCurrent ? sessionState.signInError : null;
  const hasSession = sessionCurrent && sessionState.hasSession;

  const chain = walletId ? walletChain(walletId) : null;

  // Server session: writes sign in lazily (first 401) with a one-time nonce signature.
  useEffect(() => {
    if (!provider || !address) {
      registerSessionEnsurer(null);
      return;
    }
    let active = true;
    const update = (patch: Partial<Omit<SessionState, "address">>) => {
      if (!active) return;
      setSessionState((prev) =>
        prev.address === address
          ? { ...prev, ...patch }
          : { address, signingIn: false, signInError: null, hasSession: false, ...patch },
      );
    };
    let pending: Promise<void> | null = null;
    registerSessionEnsurer(() => {
      pending ??= (async () => {
        update({ signingIn: true, signInError: null });
        const nonceResponse = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
        const nonce = (await nonceResponse.json().catch(() => ({}))) as { nonce?: string; message?: string; error?: { message?: string } };
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
        update({ hasSession: true });
      })()
        .catch((err: unknown) => {
          update({ signInError: err instanceof Error ? err.message : "Wallet sign-in failed" });
          throw err;
        })
        .finally(() => {
          pending = null;
          update({ signingIn: false });
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
        update({ hasSession: session.walletAddress === normalized });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      registerSessionEnsurer(null);
      setSessionState((prev) => (prev.signingIn ? { ...prev, signingIn: false } : prev));
    };
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
    // Restore is async by nature (provider handshake). The saved id is only known after mount.
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
    const frame = requestAnimationFrame(() => {
      void refreshActivity();
    });
    return () => cancelAnimationFrame(frame);
  }, [refreshActivity]);

  // Network detection for EVM wallets. Betting does not depend on the wallet's
  // network (sign-in is chain-agnostic personal_sign); this only powers the
  // Robinhood Chain indicator and switch action.
  const robinhoodChain = useMemo(() => publicRobinhoodChain(), []);
  const [networkChainId, setNetworkChainId] = useState<number | null>(null);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const evmProvider = provider && isEthereumProvider(provider) ? provider : null;

  useEffect(() => {
    if (!evmProvider) return;
    let active = true;
    readWalletChainId(evmProvider)
      .then((id) => {
        if (active) setNetworkChainId(id);
      })
      .catch(() => {
        if (active) setNetworkChainId(null);
      });
    const onChainChanged = (...args: unknown[]) => setNetworkChainId(parseChainId(args[0]));
    evmProvider.on?.("chainChanged", onChainChanged);
    return () => {
      active = false;
      evmProvider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [evmProvider]);

  const switchToRobinhoodChain = useCallback(async () => {
    if (!evmProvider) {
      setError("Connect an EVM wallet (MetaMask or Binance) to use Robinhood Chain.");
      return;
    }
    setSwitchingNetwork(true);
    setError(null);
    try {
      setNetworkChainId(await switchWalletToChain(evmProvider, robinhoodChain));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch network");
      setNetworkChainId(await readWalletChainId(evmProvider).catch(() => null));
    } finally {
      setSwitchingNetwork(false);
    }
  }, [evmProvider, robinhoodChain]);

  const detectedChainId = evmProvider ? networkChainId : null;

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
      networkChainId: detectedChainId,
      robinhoodChain: { id: robinhoodChain.id, name: robinhoodChain.name },
      onRobinhoodChain: isRobinhoodChainId(detectedChainId, robinhoodChain),
      switchingNetwork,
      switchToRobinhoodChain,
      signingIn,
      signInError,
      hasSession,
    }),
    [
      signingIn,
      signInError,
      hasSession,
      detectedChainId,
      robinhoodChain,
      switchingNetwork,
      switchToRobinhoodChain,
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
