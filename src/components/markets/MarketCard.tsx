"use client";

import Link from "next/link";
import {
  categoryColor,
  categoryLabel,
  formatUsdCompact,
  yesChance,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";
import { cardClass } from "@/components/markets/primitives";

export function MarketCard({ market }: { market: Market }) {
  const yes = yesChance(market);
  const no = Math.max(1, 100 - yes);
  const color = categoryColor(market.category);
  const live = market.source === "polymarket" || market.live;

  return (
    <Link
      href={`/contract/${encodeURIComponent(market.id)}`}
      className={`${cardClass} group flex h-full flex-col overflow-hidden p-4 no-underline`}
    >
      <div className="flex items-start gap-3">
        {market.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={market.image}
            alt=""
            className="h-12 w-12 shrink-0 rounded-2xl border border-black/[0.06] object-cover"
          />
        ) : (
          <Identicon seed={market.id} className="h-12 w-12 shrink-0 rounded-2xl" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8b887f]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {categoryLabel(market.category)}
            </span>
            {live ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f3ec] px-1.5 py-0.5 text-[#2c7a55]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2c7a55]" />
                Live
              </span>
            ) : null}
            <span className="text-[#b0ada4]">{market.resolvesIn} left</span>
          </p>
          <h3 className="mt-1.5 line-clamp-2 min-h-[2.5em] text-[15px] leading-snug font-semibold tracking-[-0.02em] text-[#171717]">
            {market.title}
          </h3>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-[#f0ebe3]">
          <span className="h-full bg-[#2c7a55] transition-[width] duration-500" style={{ width: `${yes}%` }} />
          <span className="h-full bg-[#c45c6a] transition-[width] duration-500" style={{ width: `${no}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#e8f6ee] px-3 py-2">
            <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-[#2c7a55] uppercase">Yes</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.03em] text-[#171717]">
              {yes}%
            </p>
          </div>
          <div className="rounded-xl bg-[#f8e8ea] px-3 py-2">
            <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-[#c45c6a] uppercase">No</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.03em] text-[#171717]">
              {no}%
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b887f]">
        {market.volumeUsd ? <span>{formatUsdCompact(market.volumeUsd)} vol</span> : null}
        {market.volume24hrUsd ? <span>{formatUsdCompact(market.volume24hrUsd)} 24h</span> : null}
        {market.liquidityUsd ? <span>{formatUsdCompact(market.liquidityUsd)} liq</span> : null}
      </p>
    </Link>
  );
}
