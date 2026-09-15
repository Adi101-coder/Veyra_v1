"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { WalletIcon } from "@/components/wallet/WalletIcons";
import {
  WALLET_OPTIONS,
  shortenAddress,
  type WalletId,
} from "@/lib/solana-wallet";

export function ConnectWalletButton() {
  const { address, connecting, error, connect, disconnect, clearError } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState<WalletId | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
    return (
      <div className="relative justify-self-end">
        <button
          type="button"
          onClick={() => setMenu((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-[#1a1a1a] bg-transparent px-4 py-1.5 font-serif text-[14px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white sm:px-5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2f9e6e]" />
          {shortenAddress(address)}
        </button>
        {menu ? (
          <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-[rgba(26,26,26,0.12)] bg-white shadow-[0_12px_40px_-20px_rgba(26,26,26,0.45)]">
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
    <div className="justify-self-end">
      <button
        type="button"
        onClick={() => {
          clearError();
          setOpen(true);
        }}
        className="rounded-full border border-[#1a1a1a] bg-transparent px-5 py-1.5 font-serif text-[14px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white sm:px-6"
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
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
