"use client";

import Link from "next/link";
import type { LiveTrade, VenueHolder } from "@/lib/polymarket";
import { Identicon } from "@/components/dashboard/Identicon";
import { cardClass } from "@/components/markets/primitives";

function Avatar({ seed, src }: { seed: string; src: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-8 w-8 rounded-full object-cover" />
    );
  }
  return <Identicon seed={seed} className="h-8 w-8 rounded-full" />;
}

export function LiveTape({
  trades,
  loading,
  error,
}: {
  trades: LiveTrade[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <section>
      <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.03em] text-[#182d4a]">
        Live trades
      </h2>
      {loading && !trades.length ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#65758b]`}>Syncing Polymarket tape…</p>
      ) : error && !trades.length ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#265bff]`}>{error}</p>
      ) : trades.length === 0 ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#65758b]`}>No recent prints.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((trade) => (
            <li key={trade.id}>
              <Link
                href={`/contract/${encodeURIComponent(trade.marketId)}`}
                className={`${cardClass} flex min-w-0 items-center gap-3 px-3 py-3 no-underline sm:px-4`}
              >
                <Avatar seed={trade.trader} src={trade.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#182d4a]">{trade.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#65758b]">
                    {trade.trader} · {trade.side} · {trade.ago}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-semibold tabular-nums text-[#182d4a]">{trade.invested}</p>
                  <p className={`font-mono text-[10px] ${trade.up ? "text-[#2c7a55]" : "text-[#ad4c62]"}`}>
                    {trade.payout}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LiveHolders({
  holders,
  loading,
}: {
  holders: VenueHolder[];
  loading?: boolean;
}) {
  if (loading && !holders.length) {
    return <p className="py-6 text-[13px] text-[#65758b]">Loading venue holders…</p>;
  }
  if (!holders.length) return null;
  return (
    <section className="rounded-[22px] border border-[rgba(24,45,74,0.06)] bg-[#ffffff] px-5 py-5 sm:px-7 sm:py-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#182d4a]">
        Polymarket holders
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {holders.map((holder) => (
          <li key={holder.id} className="flex items-center gap-3">
            <Avatar seed={holder.trader} src={holder.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-[#182d4a]">{holder.trader}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#65758b]">
                {holder.outcome} · {holder.shares} sh
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] tabular-nums text-[#182d4a]">{holder.value}</p>
              {holder.pnl ? (
                <p className={`font-mono text-[10px] ${holder.up ? "text-[#2c7a55]" : "text-[#ad4c62]"}`}>
                  {holder.pnl}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
