"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";
import { oddFromChance, sportLeagues, sportTabs, type SportTab } from "@/lib/market-feed";
import {
  cardClass,
  CrestMark,
  HorizontalRail,
  LeagueMark,
  PillTabs,
  SectionHead,
} from "@/components/markets/primitives";

export function SportSection() {
  const [tab, setTab] = useState<SportTab>("football");
  const leagues = useMemo(
    () => (tab === "all" ? sportLeagues : sportLeagues.filter((league) => league.sport === tab)),
    [tab],
  );
  const total = sportLeagues.reduce((sum, league) => sum + league.count, 0);

  return (
    <section id="sport" className="scroll-mt-24">
      <SectionHead
        title="Sport"
        count={total}
        extra={<PillTabs tabs={sportTabs} value={tab} onChange={setTab} />}
      />
      {leagues.length === 0 ? (
        <p className={`${cardClass} px-5 py-12 text-center text-[14px] text-[#8b887f]`}>
          No live {sportTabs.find((item) => item.id === tab)?.label.toLowerCase()} markets right now.
        </p>
      ) : null}
      <div className="flex flex-col gap-8">
        {leagues.map((league) => (
          <div key={league.id}>
            <p className="mb-3.5 flex items-center gap-2 text-[14px] font-semibold text-[#171717]">
              <LeagueMark id={league.id} />
              {league.name}
              <span className="text-[12px] font-medium text-[#8b887f]">({league.count})</span>
              <ChevronRight className="h-4 w-4 text-[#c4c0b6]" />
            </p>
            {league.outrights.length ? (
              <div className="mb-3.5 grid gap-3.5 md:grid-cols-2">
                {league.outrights.map((card) => (
                  <article key={card.id} className={`${cardClass} p-5`}>
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <LeagueMark id="ucl" />
                        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">{card.title}</h3>
                      </div>
                      <Bookmark className="h-4 w-4 text-[#c4c0b6]" />
                    </div>
                    <ul className="flex flex-col gap-3">
                      {card.runners.map((runner) => (
                        <li key={runner.name} className="flex items-center gap-3">
                          <p className="min-w-0 flex-1 truncate text-[14px]">{runner.name}</p>
                          <p className="w-14 text-right text-[14px] font-semibold tabular-nums">
                            {runner.chance}%
                          </p>
                          <Link
                            href={`/contract/${runner.marketId}`}
                            className="rounded-lg bg-[#f4f2ec] px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#525252] no-underline hover:bg-[#eceae3]"
                          >
                            YES
                          </Link>
                          <Link
                            href={`/contract/${runner.marketId}`}
                            className="rounded-lg bg-[#f4f2ec] px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#525252] no-underline hover:bg-[#eceae3]"
                          >
                            NO
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : null}
            {league.matches.length ? (
              <HorizontalRail>
                {league.matches.map((match) => (
                  <Link
                    key={match.marketId}
                    href={`/contract/${match.marketId}`}
                    className={`${cardClass} w-[260px] shrink-0 p-5 no-underline`}
                  >
                    <p className="mb-4 text-center text-[12px] font-medium text-[#8b887f]">{match.when}</p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <CrestMark crest={match.home.crest} />
                        <p className="text-[13px] font-semibold">{match.home.name}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[22px] font-semibold tracking-[-0.05em]">{match.kickoff.split(" ")[0]}</p>
                        <p className="text-[11px] font-medium text-[#8b887f]">{match.kickoff.split(" ")[1]}</p>
                      </div>
                      <div className="flex flex-col items-center gap-2 text-center">
                        <CrestMark crest={match.away.crest} />
                        <p className="text-[13px] font-semibold">{match.away.name}</p>
                      </div>
                    </div>
                    <div
                      className={`mt-4 grid gap-1.5 text-center ${
                        match.draw == null ? "grid-cols-2" : "grid-cols-3"
                      }`}
                    >
                      <div className="rounded-lg bg-[#f4f2ec] px-1 py-2.5">
                        <p className="text-[13px] font-semibold tabular-nums">{match.home.chance}%</p>
                        <p className="mt-0.5 text-[11px] text-[#8b887f]">{oddFromChance(match.home.chance)}</p>
                      </div>
                      {match.draw != null ? (
                        <div className="rounded-lg bg-[#f4f2ec] px-1 py-2.5">
                          <p className="text-[12px] font-semibold tabular-nums">DRAW {match.draw}%</p>
                          <p className="mt-0.5 text-[11px] text-[#8b887f]">{oddFromChance(match.draw)}</p>
                        </div>
                      ) : null}
                      <div className="rounded-lg bg-[#f4f2ec] px-1 py-2.5">
                        <p className="text-[13px] font-semibold tabular-nums">{match.away.chance}%</p>
                        <p className="mt-0.5 text-[11px] text-[#8b887f]">{oddFromChance(match.away.chance)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </HorizontalRail>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
