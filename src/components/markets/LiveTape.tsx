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
      <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.03em] text-[#171717]">
        Live trades
      </h2>
      {loading && !trades.length ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#8b887f]`}>Syncing Polymarket tape…</p>
      ) : error && !trades.length ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#b58a2a]`}>{error}</p>
      ) : trades.length === 0 ? (
        <p className={`${cardClass} px-5 py-8 text-[13px] text-[#8b887f]`}>No recent prints.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((trade) => (
            <li key={trade.id}>
              <Link
                href={`/contract/${encodeURIComponent(trade.marketId)}`}
                className={`${cardClass} flex items-center gap-3 px-4 py-3 no-underline`}
              >
                <Avatar seed={trade.trader} src={trade.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#171717]">{trade.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b887f]">
                    {trade.trader} · {trade.side} · {trade.ago}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-semibold tabular-nums text-[#171717]">{trade.invested}</p>
                  <p className={`font-mono text-[10px] ${trade.up ? "text-[#2c7a55]" : "text-[#c45c6a]"}`}>
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
    return <p className="py-6 text-[13px] text-[#8b887f]">Loading venue holders…</p>;
  }
  if (!holders.length) return null;
  return (
    <section className="rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-5 sm:px-7 sm:py-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
        Polymarket holders
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {holders.map((holder) => (
          <li key={holder.id} className="flex items-center gap-3">
            <Avatar seed={holder.trader} src={holder.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-[#1a1a1a]">{holder.trader}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                {holder.outcome} · {holder.shares} sh
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] tabular-nums text-[#1a1a1a]">{holder.value}</p>
              {holder.pnl ? (
                <p className={`font-mono text-[10px] ${holder.up ? "text-[#2c7a55]" : "text-[#c45c6a]"}`}>
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
