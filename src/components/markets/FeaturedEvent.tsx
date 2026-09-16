"use client";

import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { featuredEvent } from "@/lib/market-feed";
import { cardClass, CrestMark } from "@/components/markets/primitives";

function DualChart({
  home,
  away,
}: {
  home: number[];
  away: number[];
}) {
  const w = 560;
  const h = 168;
  const toPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * w;
        const y = h - 8 - (value / 100) * (h - 16);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const lastHome = home[home.length - 1] ?? 50;
  const lastAway = away[away.length - 1] ?? 50;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[168px] w-full" aria-hidden>
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            x1="0"
            x2={w}
            y1={h - 8 - (tick / 100) * (h - 16)}
            y2={h - 8 - (tick / 100) * (h - 16)}
            stroke="rgba(26,26,26,0.06)"
          />
          <text
            x={w - 2}
            y={h - 8 - (tick / 100) * (h - 16) + 3}
            textAnchor="end"
            className="fill-[#c0bcb4] text-[9px]"
          >
            {tick}%
          </text>
        </g>
      ))}
      <path d={toPath(away)} fill="none" stroke="#c45c6a" strokeWidth="1.8" />
      <path d={toPath(home)} fill="none" stroke="#2f9e6e" strokeWidth="1.8" />
      <circle cx={w} cy={h - 8 - (lastHome / 100) * (h - 16)} r="3.5" fill="#2f9e6e" />
      <circle cx={w} cy={h - 8 - (lastAway / 100) * (h - 16)} r="3.5" fill="#c45c6a" />
    </svg>
  );
}

export function FeaturedEvent() {
  const event = featuredEvent;

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
      <article className={`${cardClass} px-5 py-5 sm:px-6`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-[#8a8a8a]">Tennis</p>
            <h2 className="mt-1 font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a] sm:text-[26px]">
              <Link href={`/contract/${event.marketId}`} className="text-inherit no-underline">
                {event.home.name} vs {event.away.name}
              </Link>
            </h2>
            <p className="mt-1 text-[12px] text-[#9a9a9a]">{event.when}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full border border-[rgba(26,26,26,0.08)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a]">
              {event.league}
            </span>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-3">
            <CrestMark crest={event.home.crest} size="lg" />
            <div>
              <p className="text-[13px] font-medium tracking-[-0.02em]">{event.home.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
                {event.home.short}
              </p>
            </div>
          </div>
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a9a9a]">
              {event.clockLabel}
            </p>
            <p className="font-serif text-[28px] tracking-[-0.04em] text-[#1a1a1a]">{event.clock}</p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <div className="text-right">
              <p className="text-[13px] font-medium tracking-[-0.02em]">{event.away.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
                {event.away.short}
              </p>
            </div>
            <CrestMark crest={event.away.crest} size="lg" />
          </div>
        </div>

        <div className="relative">
          <DualChart home={event.homeSeries} away={event.awaySeries} />
          <p className="absolute top-[18%] right-10 text-[12px] font-medium text-[#2f9e6e]">
            {event.home.short} {event.home.chance}%
          </p>
          <p className="absolute top-[58%] right-10 text-[12px] font-medium text-[#c45c6a]">
            {event.away.short} {event.away.chance}%
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={`/contract/${event.marketId}`}
            className="rounded-xl bg-[#f4f2ed] px-4 py-3 text-center no-underline"
          >
            <p className="text-[12px] text-[#6e6e6e]">{event.home.short}</p>
            <p className="mt-1 text-[18px] font-medium tracking-[-0.03em] text-[#1a1a1a]">
              {event.home.chance}%
            </p>
          </Link>
          <Link
            href={`/contract/${event.marketId}`}
            className="rounded-xl bg-[#f4f2ed] px-4 py-3 text-center no-underline"
          >
            <p className="text-[12px] text-[#6e6e6e]">{event.away.short}</p>
            <p className="mt-1 text-[18px] font-medium tracking-[-0.03em] text-[#1a1a1a]">
              {event.away.chance}%
            </p>
          </Link>
        </div>

        <div className="mt-6">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
            Top positions
          </p>
          <ul className="flex flex-col gap-3">
            {event.positions.map((row, index) => (
              <li key={`${row.trader}-${index}`} className="flex items-center gap-3">
                <Identicon seed={row.trader} className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{row.trader}</p>
                  <p className="truncate text-[12px] text-[#8a8a8a]">{row.side}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-medium">{row.amount}</p>
                  <p className={`text-[11px] ${row.up ? "text-[#2f9e6e]" : "text-[#c45c6a]"}`}>
                    {row.delta}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <aside className={`${cardClass} px-5 py-5`}>
        <p className="mb-4 flex items-center gap-1.5 text-[15px] font-medium text-[#1a1a1a]">
          <span className="text-[#c45c6a]">♥</span> Most Loved
        </p>
        <ul className="flex flex-col gap-4">
          {event.loved.map((item) => (
            <li key={item.title}>
              <Link href={`/contract/${item.marketId}`} className="flex gap-3 no-underline">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1f4b99] text-[8px] font-medium tracking-[0.08em] text-white">
                  GDL
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#1a1a1a]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#9a9a9a]">{item.when}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/markets#sport"
          className="mt-5 block rounded-full border border-[rgba(26,26,26,0.1)] py-2.5 text-center text-[13px] text-[#5a5a5a] no-underline hover:bg-[#faf8f4]"
        >
          View All (6+)
        </Link>
      </aside>
    </section>
  );
}
