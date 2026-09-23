"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { encodeFunctionData, erc20Abi } from "viem";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { registerSessionEnsurer, requestWalletSignIn } from "@/lib/betting-api";
import { isRobinhoodChainId, publicRobinhoodChain } from "@/lib/robinhood-chain";
import {
  isEthereumProvider,
  signSessionMessage,
  type InjectedEthereumProvider,
} from "@/lib/solana-wallet";
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
  /** RainbowKit connector name, e.g. "MetaMask". */
  walletName: string | null;
  chain: WalletChain | null;
  connecting: boolean;
  error: string | null;
  activity: ActivityState;
  disconnect: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  clearError: () => void;
  /** The wallet's current chain id, or null when disconnected. */
  networkChainId: number | null;
  robinhoodChain: { id: number; name: string };
  onRobinhoodChain: boolean;
  switchingNetwork: boolean;
  switchToRobinhoodChain: () => Promise<void>;
  /**
   * Sends an ERC-20 deposit to the treasury from the connected wallet, switching
   * chain first if needed. Returns the transaction hash. The wallet signs it; the
   * server never can, because it holds no treasury key.
   */
  depositToTreasury: (input: {
    chainId: number;
    contract: string;
    treasury: string;
    amountBase: bigint;
  }) => Promise<string>;
  /** True while the one-time wallet sign-in signature (nonce → sign → verify) runs. */
  signingIn: boolean;
  /** Message from the last failed wallet sign-in; cleared when a new one starts. */
  signInError: string | null;
  /** Whether the server holds a verified session for the connected wallet. */
  hasSession: boolean;
  /** False until the session cookie has been checked for the connected wallet. */
  sessionChecked: boolean;
  /** Prompts the one-time wallet signature that creates a server session. */
  signIn: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

type SessionState = {
  address: string | null;
  signingIn: boolean;
  signInError: string | null;
  hasSession: boolean;
  checked: boolean;
};

const idleActivity: ActivityState = { status: "idle", data: null, error: null };

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: switchingNetwork } = useSwitchChain();
  const address = account.address ?? null;
  const walletName = account.connector?.name ?? null;
  const chain: WalletChain | null = address ? "evm" : null;
  const connecting = account.isConnecting;
  const networkChainId = address ? (account.chainId ?? null) : null;

  const [evmProvider, setEvmProvider] = useState<InjectedEthereumProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityState>(idleActivity);
  const [sessionState, setSessionState] = useState<SessionState>({
    address: null,
    signingIn: false,
    signInError: null,
    hasSession: false,
    checked: false,
  });
  const sessionCurrent = sessionState.address !== null && sessionState.address === address;
  const signingIn = sessionCurrent && sessionState.signingIn;
  const signInError = sessionCurrent ? sessionState.signInError : null;
  const hasSession = sessionCurrent && sessionState.hasSession;
  const sessionChecked = sessionCurrent && sessionState.checked;
  const seenConnected = useRef(false);

  useEffect(() => {
    const connector = account.connector;
    if (!connector || !address) {
      setEvmProvider(null);
      return;
    }
    let active = true;
    connector
      .getProvider()
      .then((provider) => {
        if (!active) return;
        if (provider && isEthereumProvider(provider as InjectedEthereumProvider)) {
          setEvmProvider(provider as InjectedEthereumProvider);
        } else {
          setEvmProvider(null);
        }
      })
      .catch(() => {
        if (active) setEvmProvider(null);
      });
    return () => {
      active = false;
    };
  }, [account.connector, address]);

  useEffect(() => {
    if (account.status === "connected") seenConnected.current = true;
    if (account.status === "disconnected" && seenConnected.current) {
      seenConnected.current = false;
      setActivity(idleActivity);
      void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    }
  }, [account.status]);

  // Server session: writes sign in lazily (first 401) with a one-time nonce signature.
  useEffect(() => {
    if (!evmProvider || !address) {
      registerSessionEnsurer(null);
      return;
    }
    let active = true;
    const update = (patch: Partial<Omit<SessionState, "address">>) => {
      if (!active) return;
      setSessionState((prev) =>
        prev.address === address
          ? { ...prev, ...patch }
          : { address, signingIn: false, signInError: null, hasSession: false, checked: false, ...patch },
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
        const nonce = (await nonceResponse.json().catch(() => ({}))) as {
          nonce?: string;
          message?: string;
          error?: { message?: string };
        };
        if (!nonceResponse.ok || !nonce.nonce || !nonce.message) {
          throw new Error(nonce.error?.message ?? "Could not start wallet sign-in");
        }
        const signature = await signSessionMessage(evmProvider, address, nonce.message);
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
      .then(async (session) => {
        const normalized = address.startsWith("0x") ? address.toLowerCase() : address;
        if (session.walletAddress && session.walletAddress !== normalized) {
          await fetch("/api/auth/logout", { method: "POST" });
          update({ hasSession: false, checked: true });
          return;
        }
        update({ hasSession: session.walletAddress === normalized, checked: true });
      })
      .catch(() => {
        update({ checked: true });
      });
    return () => {
      active = false;
      registerSessionEnsurer(null);
      setSessionState((prev) => (prev.signingIn ? { ...prev, signingIn: false } : prev));
    };
  }, [evmProvider, address]);

  const signIn = useCallback(() => requestWalletSignIn(), []);

  const disconnect = useCallback(async () => {
    await disconnectAsync();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setActivity(idleActivity);
    setError(null);
  }, [disconnectAsync]);

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
    if (chain === "evm" && networkChainId == null) {
      setActivity((prev) => ({ status: "loading", data: prev.data, error: null }));
      return;
    }
    try {
      const data = await fetchWalletActivity(address, chain, networkChainId);
      setActivity({ status: "ready", data, error: null });
    } catch (err) {
      setActivity({
        status: "error",
        data: null,
        error: err instanceof Error ? err.message : "Could not load transactions",
      });
    }
  }, [address, chain, networkChainId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void refreshActivity();
    });
    return () => cancelAnimationFrame(frame);
  }, [refreshActivity]);

  const robinhoodChain = useMemo(() => publicRobinhoodChain(), []);

  const switchToRobinhoodChain = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet to use Robinhood Chain.");
      return;
    }
    setError(null);
    try {
      await switchChainAsync({ chainId: robinhoodChain.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch network");
    }
  }, [address, robinhoodChain.id, switchChainAsync]);

  /**
   * Sends a deposit straight from the user's wallet: switch to the asset's chain,
   * then an ERC-20 transfer to the treasury.
   *
   * The wallet signs it, this app never does — the treasury is watch-only and the
   * server holds no key for it. Deposits are credited from the confirmed Transfer
   * log, keyed by (chainId, txHash, logIndex), so a user who sends twice or
   * resubmits is credited once per real transfer and no more.
   */
  const depositToTreasury = useCallback(
    async (input: { chainId: number; contract: string; treasury: string; amountBase: bigint }) => {
      if (!evmProvider) throw new Error("Connect an EVM wallet to deposit.");
      if (!address) throw new Error("Connect a wallet first.");
      if (input.amountBase <= 0n) throw new Error("Enter an amount greater than zero.");

      if (networkChainId !== input.chainId) {
        if (input.chainId !== robinhoodChain.id) {
          throw new Error(`Switch your wallet to chain ${input.chainId} and try again.`);
        }
        await switchChainAsync({ chainId: robinhoodChain.id });
      }

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [input.treasury as `0x${string}`, input.amountBase],
      });
      const hash = (await evmProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: input.contract, data }],
      })) as string;
      return hash;
    },
    [address, evmProvider, networkChainId, robinhoodChain.id, switchChainAsync],
  );

  const value = useMemo(
    () => ({
      address,
      walletName,
      chain,
      connecting,
      error,
      activity,
      disconnect,
      refreshActivity,
      clearError: () => setError(null),
      networkChainId,
      robinhoodChain: { id: robinhoodChain.id, name: robinhoodChain.name },
      onRobinhoodChain: isRobinhoodChainId(networkChainId, robinhoodChain),
      switchingNetwork,
      switchToRobinhoodChain,
      depositToTreasury,
      signingIn,
      signInError,
      hasSession,
      sessionChecked,
      signIn,
    }),
    [
      address,
      walletName,
      chain,
      connecting,
      error,
      activity,
      disconnect,
      refreshActivity,
      networkChainId,
      robinhoodChain,
      switchingNetwork,
      switchToRobinhoodChain,
      depositToTreasury,
      signingIn,
      signInError,
      hasSession,
      sessionChecked,
      signIn,
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
