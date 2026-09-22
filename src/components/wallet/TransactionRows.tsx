import { shortenAddress } from "@/lib/solana-wallet";
import {
  formatTxTime,
  type WalletTransaction,
} from "@/lib/wallet-activity";

export function TransactionRows({
  transactions,
  empty,
  compact = false,
}: {
  transactions: WalletTransaction[];
  empty: string;
  compact?: boolean;
}) {
  if (!transactions.length) {
    return <p className="px-1 py-6 text-[13px] italic text-[#65758b]">{empty}</p>;
  }

  return (
    <ul className={compact ? "divide-y divide-[rgba(24,45,74,0.06)]" : "divide-y divide-[rgba(24,45,74,0.08)]"}>
      {transactions.map((tx) => (
        <li key={tx.hash}>
          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex items-start justify-between gap-4 no-underline transition hover:bg-[#f8fbff] ${
              compact ? "px-3 py-2.5" : "px-1 py-4 sm:px-2"
            }`}
          >
            <div className="min-w-0">
              <p className="font-serif text-[14px] capitalize text-[#182d4a]">
                {tx.method}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-[#65758b]">
                {tx.counterparty ? shortenAddress(tx.counterparty, 5) : shortenAddress(tx.hash, 6)}
                <span className="text-[#dce5f1]"> · </span>
                {formatTxTime(tx.timestamp)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={`font-serif text-[14px] ${
                  tx.direction === "in"
                    ? "text-[#2f9e6e]"
                    : tx.direction === "out"
                      ? "text-[#182d4a]"
                      : "text-[#65758b]"
                }`}
              >
                {tx.amountLabel}
              </p>
              <p
                className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  tx.status === "failed" ? "text-[#ad4c62]" : "text-[#65758b]"
                }`}
              >
                {tx.status}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
