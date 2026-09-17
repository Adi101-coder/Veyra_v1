"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { packs } from "@/lib/market-feed";
import { cardClass, CrestMark, RailButtons, RailTrack, SectionHead, useRail } from "@/components/markets/primitives";

export function PacksRow() {
  const rail = useRail();

  return (
    <section>
      <SectionHead
        title="Packs"
        sample
        count={packs.length}
        extra={<RailButtons onPrev={rail.onPrev} onNext={rail.onNext} />}
      />
      <RailTrack railRef={rail.ref}>
        {packs.map((pack) => (
          <article
            key={pack.id}
            className={`${cardClass} flex w-[min(100%,300px)] shrink-0 flex-col p-5`}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium tracking-[0.08em] text-[#8b887f] uppercase">
                  {pack.league}
                </p>
                <h3 className="mt-1.5 text-[16px] leading-snug font-semibold tracking-[-0.03em] text-[#171717]">
                  {pack.title}
                </h3>
              </div>
              <Bookmark className="h-4 w-4 text-[#c4c0b6]" />
            </div>
            <ul className="flex flex-1 flex-col gap-3">
              {pack.legs.map((leg) => (
                <li key={leg.marketId + leg.team}>
                  <Link
                    href={`/contract/${leg.marketId}`}
                    className="flex items-center gap-2.5 no-underline"
                  >
                    <CrestMark crest={leg.crest} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[#171717]">
                        <span className="font-semibold">{leg.team}</span>{" "}
                        <span className="text-[#6b6860]">{leg.side}</span>{" "}
                        <span className="text-[#8b887f]">{leg.odd}</span>
                      </span>
                      <span className="block truncate text-[12px] text-[#8b887f]">
                        {leg.team} vs {leg.opponent}
                      </span>
                    </span>
                    <span className="hidden w-[4.6rem] shrink-0 text-right text-[11px] leading-4 text-[#8b887f] sm:block">
                      {leg.when.replace(" · ", "\n")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={pack.legs[0] ? `/contract/${pack.legs[0].marketId}` : "/markets"}
              className="mt-5 block rounded-full border border-black/[0.08] py-2.5 text-center text-[14px] font-semibold text-[#171717] no-underline transition hover:bg-[#171717] hover:text-white"
            >
              Buy Pack {pack.multiplier}
            </Link>
          </article>
        ))}
      </RailTrack>
    </section>
  );
}
