"use client";

import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { trendingPositions } from "@/lib/market-feed";
import { cardClass, RailButtons, RailTrack, SectionHead, useRail } from "@/components/markets/primitives";

export function TrendingPositions() {
  const rail = useRail();

  return (
    <section>
      <SectionHead
        title="Trending Positions Live"
        extra={
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#8a8a8a]">Refresh</span>
            <RailButtons onPrev={rail.onPrev} onNext={rail.onNext} />
          </div>
        }
      />
      <RailTrack railRef={rail.ref}>
        {trendingPositions.map((row) => (
          <Link
            key={row.trader + row.title}
            href={`/contract/${row.marketId}`}
            className={`${cardClass} w-[260px] shrink-0 p-4 no-underline`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <Identicon seed={row.trader} className="h-6 w-6" />
                <span className="truncate text-[13px] font-medium text-[#1a1a1a]">{row.trader}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[#9a9a9a]">{row.ago}</span>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-[#1a1a1a]">
              <span className="font-medium">{row.invested} invested</span>
              <span className="text-[#8a8a8a]">, </span>
              <span className="font-medium text-[#2f9e6e]">{row.payout} potential payout</span>
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Identicon seed={row.title} className="h-8 w-8 rounded-lg" />
              <p className="min-w-0 truncate text-[13px] text-[#1a1a1a]">{row.title}</p>
            </div>
            <p className={`mt-2 text-[12px] ${row.up ? "text-[#2f9e6e]" : "text-[#c45c6a]"}`}>
              {row.side}
            </p>
          </Link>
        ))}
      </RailTrack>
    </section>
  );
}
