"use client";

import Link from "next/link";
import { packs } from "@/lib/market-feed";
import { cardClass, CrestMark, RailButtons, RailTrack, SectionHead, useRail } from "@/components/markets/primitives";

export function PacksRow() {
  const rail = useRail();

  return (
    <section>
      <SectionHead
        title="Packs"
        count={packs.length}
        extra={<RailButtons onPrev={rail.onPrev} onNext={rail.onNext} />}
      />
      <RailTrack railRef={rail.ref}>
        {packs.map((pack) => (
          <article
            key={pack.id}
            className={`${cardClass} flex w-[min(100%,280px)] shrink-0 flex-col p-4`}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                  {pack.league}
                </p>
                <h3 className="mt-1 font-serif text-[17px] tracking-[-0.02em] text-[#1a1a1a]">
                  {pack.title}
                </h3>
              </div>
              <span className="text-[#c8c4bc]" aria-hidden>
                ⤓
              </span>
            </div>
            <ul className="flex flex-1 flex-col gap-2.5">
              {pack.legs.map((leg) => (
                <li key={leg.marketId + leg.team}>
                  <Link
                    href={`/contract/${leg.marketId}`}
                    className="flex items-start gap-2.5 no-underline"
                  >
                    <CrestMark crest={leg.crest} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[#1a1a1a]">
                        <span className="font-medium">{leg.team}</span>{" "}
                        <span className="text-[#6e6e6e]">{leg.side}</span>{" "}
                        <span className="text-[#9a9a9a]">{leg.odd}</span>
                      </span>
                      <span className="block truncate text-[11px] text-[#9a9a9a]">
                        {leg.team} vs {leg.opponent}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-[10px] leading-4 whitespace-pre-line text-[#9a9a9a] sm:block">
                      {leg.when.replace(" · ", "\n")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/contract/${pack.legs[0]?.marketId}`}
              className="mt-4 block rounded-full border border-[rgba(26,26,26,0.1)] py-2.5 text-center text-[13px] font-medium text-[#1a1a1a] no-underline hover:bg-[#faf8f4]"
            >
              Buy Pack {pack.multiplier}
            </Link>
          </article>
        ))}
      </RailTrack>
    </section>
  );
}
