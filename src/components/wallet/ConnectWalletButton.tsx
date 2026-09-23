"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/components/wallet/WalletProvider";
import { TransactionRows } from "@/components/wallet/TransactionRows";
import { shortenAddress } from "@/lib/solana-wallet";

export function ConnectWalletButton({ className = "" }: { className?: string }) {
  const { openConnectModal } = useConnectModal();
  const {
    address,
    walletName,
    activity,
    connecting,
    error,
    disconnect,
    chain,
    networkChainId,
    robinhoodChain,
    onRobinhoodChain,
    switchingNetwork,
    switchToRobinhoodChain,
  } = useWallet();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (address) {
    const preview = activity.data?.transactions.slice(0, 4) ?? [];
    return (
      <div className={`relative shrink-0 justify-self-end ${className}`} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenu((value) => !value)}
          className="inline-flex max-w-[11rem] items-center gap-2 truncate rounded-full border border-[#265bff] bg-transparent px-3 py-1.5 font-serif text-[13px] text-[#182d4a] transition hover:bg-[#1847d8] hover:text-white sm:max-w-none sm:px-5 sm:text-[14px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2f9e6e]" />
          {shortenAddress(address)}
        </button>
        {menu ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[rgba(24,45,74,0.12)] bg-white shadow-[0_12px_40px_-20px_rgba(24,45,74,0.45)]">
            <div className="border-b border-[rgba(24,45,74,0.08)] px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
                {walletName ?? "Connected"}
              </p>
              <p className="mt-1 font-serif text-[16px] text-[#182d4a]">
                {shortenAddress(address, 5)}
              </p>
              <p className="mt-0.5 text-[12px] text-[#65758b]">
                {activity.data?.balanceLabel ?? (activity.status === "loading" ? "Reading balance…" : "—")}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {activity.status === "error" ? (
                <p className="px-4 py-3 text-[12px] text-[#ad4c62]">{activity.error}</p>
              ) : activity.status === "loading" && !activity.data ? (
                <p className="px-4 py-3 text-[12px] italic text-[#65758b]">Reading transactions…</p>
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
              className="block border-t border-[rgba(24,45,74,0.08)] px-4 py-2.5 text-[13px] text-[#182d4a] no-underline hover:bg-[#f8fbff]"
            >
              View all activity
            </Link>
            {chain === "evm" ? (
              onRobinhoodChain ? (
                <p className="border-t border-[rgba(24,45,74,0.08)] px-4 py-2.5 text-[12px] text-[#65758b]">
                  Network · {robinhoodChain.name}
                </p>
              ) : (
                <button
                  type="button"
                  disabled={switchingNetwork}
                  onClick={async () => {
                    await switchToRobinhoodChain();
                  }}
                  className="block w-full border-t border-[rgba(24,45,74,0.08)] px-4 py-2.5 text-left text-[13px] text-[#182d4a] hover:bg-[#f8fbff] disabled:opacity-50"
                >
                  {switchingNetwork ? "Switching…" : `Switch to ${robinhoodChain.name}`}
                  {networkChainId != null ? (
                    <span className="ml-1 text-[11px] text-[#65758b]">(on chain {networkChainId})</span>
                  ) : null}
                </button>
              )
            ) : null}
            {chain === "evm" && error ? (
              <p className="px-4 pb-2.5 text-[12px] text-[#ad4c62]">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                setMenu(false);
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-[#182d4a] hover:bg-[#f8fbff]"
            >
              Copy address
            </button>
            <button
              type="button"
              onClick={async () => {
                await disconnect();
                setMenu(false);
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-[#182d4a] hover:bg-[#f8fbff]"
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`shrink-0 justify-self-end ${className}`}>
      <button
        type="button"
        onClick={() => openConnectModal?.()}
        disabled={!openConnectModal}
        className="whitespace-nowrap rounded-full border border-[#265bff] bg-transparent px-3 py-1.5 font-serif text-[13px] text-[#182d4a] transition hover:bg-[#1847d8] hover:text-white disabled:opacity-60 sm:px-6 sm:text-[14px]"
      >
        {connecting ? "Connecting…" : <>Connect<span className="hidden sm:inline"> Wallet</span></>}
      </button>
    </div>
  );
}
