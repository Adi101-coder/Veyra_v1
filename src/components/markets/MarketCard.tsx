"use client";

import Link from "next/link";
import {
  categoryColor,
  categoryLabel,
  formatUsdCompact,
  marketOutcomes,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";
import { OutcomeOdds } from "@/components/markets/OutcomeOdds";
import { cardClass } from "@/components/markets/primitives";

export function MarketCard({ market }: { market: Market }) {
  const outcomes = marketOutcomes(market);
  const color = categoryColor(market.category);
  const live = market.source === "polymarket" || market.live;
  const stats = [
    market.volumeUsd ? `${formatUsdCompact(market.volumeUsd)} vol` : null,
    market.volume24hrUsd ? `${formatUsdCompact(market.volume24hrUsd)} 24h` : null,
    market.liquidityUsd ? `${formatUsdCompact(market.liquidityUsd)} liq` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/contract/${encodeURIComponent(market.id)}`}
      className={`${cardClass} group flex h-full min-h-[268px] flex-col p-4 no-underline`}
    >
      <div className="flex items-start gap-3">
        {market.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={market.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[12px] border border-[#dce5f1] object-cover"
          />
        ) : (
          <Identicon seed={market.id} className="h-10 w-10 shrink-0 rounded-[12px]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#65758b]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {categoryLabel(market.category)}
            </span>
            {live ? (
              <span className="inline-flex items-center gap-1 text-[#2c7a55]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2c7a55]" />
                Live
              </span>
            ) : null}
            <span>{market.resolvesIn} left</span>
          </p>
          <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] leading-snug font-semibold tracking-[-0.025em] text-[#182d4a]">
            {market.title}
          </h3>
        </div>
      </div>

      <div className="mt-4 min-h-[118px] flex-1">
        <OutcomeOdds outcomes={outcomes} limit={3} />
      </div>

      {stats.length ? (
        <p className="mt-auto border-t border-black/[0.05] pt-3 text-[11px] text-[#65758b]">
          {stats.join(" · ")}
        </p>
      ) : null}
    </Link>
  );
}
