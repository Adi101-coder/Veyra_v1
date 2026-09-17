"use client";

import Link from "next/link";
import { ChevronDown, Crown } from "lucide-react";
import { biggestPositions, topTraders } from "@/lib/market-feed";
import { AssetMark, cardClass, Photo, SampleBadge } from "@/components/markets/primitives";

function Rank({ rank }: { rank: number }) {
  const tone = rank === 1 ? "text-[#c4a46a]" : rank === 2 ? "text-[#9a9a9a]" : "text-[#c47a3a]";
  return <Crown className={`h-3.5 w-3.5 ${tone}`} />;
}

export function Leaderboards() {
  return (
    <section className="grid gap-3.5 lg:grid-cols-2">
      <article className={`${cardClass} px-5 py-5`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#171717] sm:text-[20px]">
            Top Traders
          </h2>
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#8b887f]">
            <SampleBadge />
            <span className="rounded-full bg-[#f4f2ec] px-2.5 py-1 text-[#171717]">Daily</span>
            <span className="inline-flex items-center gap-0.5">
              All <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
        <ul>
          {topTraders.map((trader) => (
            <li
              key={trader.handle}
              className="flex items-center gap-3 border-b border-black/[0.05] py-3.5 last:border-0"
            >
              <Rank rank={trader.rank} />
              <Photo src={trader.avatar} alt="" className="h-9 w-9 rounded-full" />
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{trader.handle}</p>
              <div className="text-right">
                <p className="text-[14px] font-semibold tabular-nums text-[#0f854f]">{trader.pnl}</p>
                <p className="text-[12px] text-[#8b887f]">{trader.roi}</p>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-[#8b887f]">
          See more <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </article>

      <article className={`${cardClass} px-5 py-5`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#171717] sm:text-[20px]">
            Biggest Positions
          </h2>
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <SampleBadge />
            <span className="inline-flex items-center gap-0.5 text-[#8b887f]">
              All <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
        <ul>
          {biggestPositions.map((row) => (
            <li
              key={row.title}
              className="flex items-start gap-3 border-b border-black/[0.05] py-3.5 last:border-0"
            >
              <Rank rank={1} />
              <AssetMark id={row.mark} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/contract/${row.marketId}`}
                  className="block truncate text-[14px] font-medium text-[#171717] no-underline"
                >
                  {row.title}
                </Link>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#8b887f]">
                  <Photo src={row.avatar} alt="" className="h-4 w-4 rounded-full" />
                  {row.trader}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                      row.sideTone === "yes"
                        ? "bg-[#e7f4ec] text-[#0f854f]"
                        : "bg-[#f8e8ea] text-[#c45c6a]"
                    }`}
                  >
                    {row.side}
                  </span>
                </p>
              </div>
              <p className="text-[14px] font-semibold tabular-nums text-[#0f854f]">{row.amount}</p>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-[#8b887f]">
          See more <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </article>
    </section>
  );
}
