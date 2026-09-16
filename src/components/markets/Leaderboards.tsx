"use client";

import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { biggestPositions, topTraders } from "@/lib/market-feed";
import { cardClass } from "@/components/markets/primitives";

function RankMark({ rank }: { rank: number }) {
  const tones = ["#c4a46a", "#b0b0b0", "#c47a3a"];
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
      style={{ color: tones[rank - 1] ?? "#8a8a8a" }}
      aria-hidden
    >
      ✦
    </span>
  );
}

export function Leaderboards() {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <article className={`${cardClass} px-5 py-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[22px] tracking-[-0.03em]">
            Top Traders <span className="text-[#c8c4bc]">›</span>
          </h2>
          <div className="flex items-center gap-3 text-[12px] text-[#8a8a8a]">
            <span className="rounded-full bg-[#f4f2ed] px-2.5 py-1 text-[#1a1a1a]">Daily</span>
            <span>All ▾</span>
          </div>
        </div>
        <ul className="flex flex-col">
          {topTraders.map((trader) => (
            <li
              key={trader.handle}
              className="flex items-center gap-3 border-b border-[rgba(26,26,26,0.06)] py-3 last:border-0"
            >
              <RankMark rank={trader.rank} />
              <Identicon seed={trader.handle} className="h-8 w-8" />
              <p className="min-w-0 flex-1 truncate text-[14px]">{trader.handle}</p>
              <div className="text-right">
                <p className="text-[14px] font-medium text-[#2f9e6e]">{trader.pnl}</p>
                <p className="text-[11px] text-[#9a9a9a]">{trader.roi}</p>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-2 text-[12px] text-[#8a8a8a]">
          See More ▾
        </button>
      </article>

      <article className={`${cardClass} px-5 py-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[22px] tracking-[-0.03em]">Biggest Positions</h2>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-[#c45c6a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c45c6a]" />
              LIVE
            </span>
            <span className="text-[#8a8a8a]">All ▾</span>
          </div>
        </div>
        <ul className="flex flex-col">
          {biggestPositions.map((row) => (
            <li
              key={row.title}
              className="flex items-start gap-3 border-b border-[rgba(26,26,26,0.06)] py-3 last:border-0"
            >
              <RankMark rank={1} />
              <Identicon seed={row.title} className="mt-0.5 h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/contract/${row.marketId}`}
                  className="block truncate text-[14px] text-[#1a1a1a] no-underline"
                >
                  {row.title}
                </Link>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#8a8a8a]">
                  <Identicon seed={row.trader} className="h-4 w-4" />
                  {row.trader}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      row.sideTone === "yes"
                        ? "bg-[#e7f4ec] text-[#2f9e6e]"
                        : "bg-[#f8e8ea] text-[#c45c6a]"
                    }`}
                  >
                    {row.side}
                  </span>
                </p>
              </div>
              <p className="text-[14px] font-medium text-[#2f9e6e]">{row.amount}</p>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-2 text-[12px] text-[#8a8a8a]">
          See More ▾
        </button>
      </article>
    </section>
  );
}
