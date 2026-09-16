"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";
import { TransactionRows } from "@/components/wallet/TransactionRows";
import { shortenAddress, WALLET_OPTIONS } from "@/lib/solana-wallet";
import { explorerAddressUrl } from "@/lib/wallet-activity";

export function ActivityView() {
  const { address, walletId, chain, activity, refreshActivity } = useWallet();
  const walletName = WALLET_OPTIONS.find((item) => item.id === walletId)?.name;

  if (!address || !chain) {
    return (
      <div className="bg-[#f4f2ed]">
        <Shell className="max-w-3xl pt-10 pb-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">
            Ledger
          </p>
          <h1 className="mt-3 font-serif text-[36px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
            Activity.
          </h1>
          <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#6e6e6e] italic">
            Connect a wallet first. VEYRA reads the public chain for that address and
            lists the recent transactions it already made.
          </p>
        </Shell>
      </div>
    );
  }

  const loading = activity.status === "loading" && !activity.data;
  const txs = activity.data?.transactions ?? [];

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">
          <Link href="/dashboard" className="text-[#b0b0b0] no-underline hover:text-[#1a1a1a]">
            Dashboard
          </Link>
          <span className="text-[#c8c4bc]"> / </span>
          Activity
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[36px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
              Wallet ledger.
            </h1>
            <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#6e6e6e] italic">
              Recent confirmed transactions for the address you connected — pulled from
              {chain === "evm" ? " Ethereum" : " Solana"}, not from VEYRA’s own books.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshActivity()}
            disabled={activity.status === "loading"}
            className="rounded-full border border-[#1a1a1a] px-4 py-1.5 font-serif text-[14px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
          >
            {activity.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-8 flex items-center gap-4 rounded-[22px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-5">
          <Identicon seed={address} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              {walletName ?? "Wallet"} · {chain === "evm" ? "Ethereum" : "Solana"}
            </p>
            <p className="mt-1 truncate font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
              {shortenAddress(address, 6)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              Balance
            </p>
            <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
              {activity.data?.balanceLabel ?? "—"}
            </p>
          </div>
        </div>

        <p className="mt-3">
          <a
            href={explorerAddressUrl(chain, address)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a] hover:text-[#1a1a1a]"
          >
            Open in explorer
          </a>
        </p>

        <div className="mt-8 border-t border-[rgba(26,26,26,0.12)] pt-2">
          {loading ? (
            <p className="py-10 text-[13px] italic text-[#8a8a8a]">Reading the chain…</p>
          ) : activity.status === "error" ? (
            <p className="py-10 text-[13px] text-[#c45c6a]">{activity.error}</p>
          ) : (
            <TransactionRows
              transactions={txs}
              empty="This address has no recent transactions on the public ledger."
            />
          )}
        </div>
      </Shell>
    </div>
  );
}
