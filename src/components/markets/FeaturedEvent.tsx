"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { featuredEvent } from "@/lib/market-feed";
import { cardClass, CrestMark, LeagueMark, Photo } from "@/components/markets/primitives";

function DualChart({ home, away }: { home: number[]; away: number[] }) {
  const w = 640;
  const h = 188;
  const pad = 8;
  const toPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * (w - 36);
        const y = h - pad - (value / 100) * (h - pad * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  const toArea = (values: number[]) => {
    const line = toPath(values);
    return `${line} L${w - 36} ${h - pad} L0 ${h - pad} Z`;
  };
  const lastHome = home[home.length - 1] ?? 50;
  const lastAway = away[away.length - 1] ?? 50;
  const yHome = h - pad - (lastHome / 100) * (h - pad * 2);
  const yAway = h - pad - (lastAway / 100) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[180px] w-full" aria-hidden>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = h - pad - (tick / 100) * (h - pad * 2);
        return (
          <g key={tick}>
            <line x1="0" x2={w - 34} y1={y} y2={y} stroke="rgba(23,23,23,0.06)" />
            <text x={w - 2} y={y + 3} textAnchor="end" fill="#b4b0a6" fontSize="10">
              {tick}%
            </text>
          </g>
        );
      })}
      <path d={toArea(away)} fill="rgba(196,92,106,0.08)" />
      <path d={toArea(home)} fill="rgba(15,133,79,0.08)" />
      <path d={toPath(away)} fill="none" stroke="#c45c6a" strokeWidth="2.2" strokeLinejoin="round" />
      <path d={toPath(home)} fill="none" stroke="#0f854f" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx={w - 36} cy={yHome} r="4" fill="#0f854f" stroke="#fff" strokeWidth="1.5" />
      <circle cx={w - 36} cy={yAway} r="4" fill="#c45c6a" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export function FeaturedEvent() {
  const event = featuredEvent;

  return (
    <section className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_19.5rem]">
      <article className={`${cardClass} px-5 py-5 sm:px-7 sm:py-6`}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-[#8b887f]">Tennis</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em] text-[#171717] sm:text-[26px]">
              <Link href={`/contract/${event.marketId}`} className="text-inherit no-underline">
                {event.home.name} vs {event.away.name}
              </Link>
            </h2>
            <p className="mt-1.5 text-[13px] text-[#8b887f]">{event.when}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Previous event"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-[#737373]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next event"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-[#737373]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center">
            <CrestMark crest={event.home.crest} size="xl" />
            <p className="text-[13px] font-medium tracking-[-0.02em] text-[#525252]">
              {event.home.name.toUpperCase()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[12px] font-medium text-[#8b887f]">{event.clockLabel}</p>
            <p className="mt-0.5 text-[34px] font-semibold tracking-[-0.05em] text-[#171717] sm:text-[40px]">
              {event.clock}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2.5 sm:flex-row-reverse sm:items-center">
            <CrestMark crest={event.away.crest} size="xl" />
            <p className="text-right text-[13px] font-medium tracking-[-0.02em] text-[#525252]">
              {event.away.name.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="relative mt-2">
          <DualChart home={event.homeSeries} away={event.awaySeries} />
          <p className="absolute top-[16%] right-12 rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-[#0f854f] shadow-sm">
            {event.home.short} {event.home.chance}%
          </p>
          <p className="absolute top-[58%] right-12 rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-[#c45c6a] shadow-sm">
            {event.away.short} {event.away.chance}%
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={`/contract/${event.marketId}`}
            className="rounded-xl bg-[#f4f2ec] px-4 py-3 text-center no-underline transition hover:bg-[#eceae3]"
          >
            <p className="text-[13px] text-[#6b6860]">{event.home.short}</p>
            <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-[#171717]">
              {event.home.chance}%
            </p>
          </Link>
          <Link
            href={`/contract/${event.marketId}`}
            className="rounded-xl bg-[#f4f2ec] px-4 py-3 text-center no-underline transition hover:bg-[#eceae3]"
          >
            <p className="text-[13px] text-[#6b6860]">{event.away.short}</p>
            <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-[#171717]">
              {event.away.chance}%
            </p>
          </Link>
        </div>

        <div className="mt-7">
          <p className="mb-3 text-[12px] font-semibold tracking-[0.08em] text-[#8b887f] uppercase">
            Top positions
          </p>
          <ul className="flex flex-col gap-3.5">
            {event.positions.map((row) => (
              <li key={`${row.trader}-${row.side}`} className="flex items-center gap-3">
                <Photo src={row.avatar} alt="" className="h-9 w-9 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#171717]">{row.trader}</p>
                  <p className="truncate text-[13px] text-[#8b887f]">{row.side}</p>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-semibold tabular-nums">{row.amount}</p>
                  <p className={`text-[12px] tabular-nums ${row.up ? "text-[#0f854f]" : "text-[#c45c6a]"}`}>
                    {row.delta}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <aside className={`${cardClass} px-5 py-5`}>
        <p className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-[#171717]">
          <Heart className="h-4 w-4 fill-[#c45c6a] text-[#c45c6a]" />
          Most Loved
        </p>
        <ul className="flex flex-col gap-4">
          {event.loved.map((item) => (
            <li key={item.title}>
              <Link href={`/contract/${item.marketId}`} className="flex items-center gap-3 no-underline">
                <span className="relative h-11 w-11 shrink-0">
                  <Photo src={item.photo} alt="" className="h-11 w-11 rounded-full" />
                  <span className="absolute -right-0.5 -bottom-0.5">
                    <LeagueMark id="gdl-open" />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[#171717]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[#8b887f]">{item.when}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/markets#sport"
          className="mt-6 block rounded-full border border-black/[0.08] py-2.5 text-center text-[13px] font-medium text-[#525252] no-underline transition hover:bg-[#faf9f6]"
        >
          View all
        </Link>
      </aside>
    </section>
  );
}
