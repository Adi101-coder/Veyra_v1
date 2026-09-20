"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/wallet/WalletProvider";
import { WalletIcon } from "@/components/wallet/WalletIcons";
import { TransactionRows } from "@/components/wallet/TransactionRows";
import {
  WALLET_OPTIONS,
  shortenAddress,
  type WalletId,
} from "@/lib/solana-wallet";

export function ConnectWalletButton() {
  const {
    address,
    activity,
    connecting,
    error,
    connect,
    disconnect,
    clearError,
    chain,
    networkChainId,
    robinhoodChain,
    onRobinhoodChain,
    switchingNetwork,
    switchToRobinhoodChain,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState<WalletId | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const pick = async (id: WalletId) => {
    setPending(id);
    try {
      await connect(id);
      setOpen(false);
    } catch {
      // error is stored on context
    } finally {
      setPending(null);
    }
  };

  if (address) {
    const preview = activity.data?.transactions.slice(0, 4) ?? [];
    return (
      <div className="relative shrink-0 justify-self-end" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenu((value) => !value)}
          className="inline-flex max-w-[11rem] items-center gap-2 truncate rounded-full border border-[#1a1a1a] bg-transparent px-3 py-1.5 font-serif text-[13px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white sm:max-w-none sm:px-5 sm:text-[14px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2f9e6e]" />
          {shortenAddress(address)}
        </button>
        {menu ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[rgba(26,26,26,0.12)] bg-white shadow-[0_12px_40px_-20px_rgba(26,26,26,0.45)]">
            <div className="border-b border-[rgba(26,26,26,0.08)] px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                Connected
              </p>
              <p className="mt-1 font-serif text-[16px] text-[#1a1a1a]">
                {shortenAddress(address, 5)}
              </p>
              <p className="mt-0.5 text-[12px] text-[#6e6e6e]">
                {activity.data?.balanceLabel ?? (activity.status === "loading" ? "Reading balance…" : "—")}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {activity.status === "error" ? (
                <p className="px-4 py-3 text-[12px] text-[#c45c6a]">{activity.error}</p>
              ) : activity.status === "loading" && !activity.data ? (
                <p className="px-4 py-3 text-[12px] italic text-[#8a8a8a]">Reading transactions…</p>
              ) : (
                <TransactionRows
                  compact
                  transactions={preview}
                  empty="No recent transactions on this address."
                />
              )}
            </div>
            <Link
              href="/activity"
              onClick={() => setMenu(false)}
              className="block border-t border-[rgba(26,26,26,0.08)] px-4 py-2.5 text-[13px] text-[#1a1a1a] no-underline hover:bg-[#f6f4ef]"
            >
              View all activity
            </Link>
            {chain === "evm" ? (
              onRobinhoodChain ? (
                <p className="border-t border-[rgba(26,26,26,0.08)] px-4 py-2.5 text-[12px] text-[#8a8a8a]">
                  Network · {robinhoodChain.name}
                </p>
              ) : (
                <button
                  type="button"
                  disabled={switchingNetwork}
                  onClick={async () => {
                    await switchToRobinhoodChain();
                  }}
                  className="block w-full border-t border-[rgba(26,26,26,0.08)] px-4 py-2.5 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f6f4ef] disabled:opacity-50"
                >
                  {switchingNetwork ? "Switching…" : `Switch to ${robinhoodChain.name}`}
                  {networkChainId != null ? (
                    <span className="ml-1 text-[11px] text-[#8a8a8a]">(on chain {networkChainId})</span>
                  ) : null}
                </button>
              )
            ) : null}
            {chain === "evm" && error ? (
              <p className="px-4 pb-2.5 text-[12px] text-[#c45c6a]">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                setMenu(false);
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f6f4ef]"
            >
              Copy address
            </button>
            <button
              type="button"
              onClick={async () => {
                await disconnect();
                setMenu(false);
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f6f4ef]"
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="shrink-0 justify-self-end">
      <button
        type="button"
        onClick={() => {
          clearError();
          setOpen(true);
        }}
        className="whitespace-nowrap rounded-full border border-[#1a1a1a] bg-transparent px-3 py-1.5 font-serif text-[13px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white sm:px-6 sm:text-[14px]"
      >
        {connecting ? "Connecting…" : <>Connect<span className="hidden sm:inline"> Wallet</span></>}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="wallet-modal-title"
            className="w-full max-w-[360px] rounded-[28px] bg-white p-6 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="wallet-modal-title"
              className="mb-5 text-[22px] font-semibold tracking-[-0.03em] text-[#1a1a1a]"
            >
              Select Wallet
            </h2>
            <ul className="flex flex-col gap-2.5">
              {WALLET_OPTIONS.map((option) => {
                const busy = pending === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => pick(option.id)}
                      className="flex w-full items-center justify-between rounded-[18px] border border-[#e6e6e6] bg-white px-5 py-[13px] text-left transition hover:border-[#d0d0d0] hover:bg-[#fafafa] disabled:opacity-60"
                    >
                      <span className="text-[15px] text-[#4a4a4a]">
                        {busy ? "Connecting…" : option.name}
                      </span>
                      <WalletIcon id={option.id} className="h-8 w-8 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {error ? <p className="mt-4 text-[13px] text-[#c45c6a]">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
