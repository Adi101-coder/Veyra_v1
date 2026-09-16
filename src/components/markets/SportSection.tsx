"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { oddFromChance, sportLeagues, sportTabs, type SportTab } from "@/lib/market-feed";
import {
  cardClass,
  CrestMark,
  HorizontalRail,
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
        <p className={`${cardClass} px-5 py-10 text-center text-sm text-[#8a8a8a]`}>
          No live {sportTabs.find((item) => item.id === tab)?.label.toLowerCase()} markets right now.
        </p>
      ) : null}
      <div className="flex flex-col gap-8">
        {leagues.map((league) => (
          <div key={league.id}>
            <p className="mb-3 flex items-center gap-2 text-[14px] font-medium text-[#1a1a1a]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] text-white">
                {league.name.slice(0, 1)}
              </span>
              {league.name}
              <span className="text-[12px] font-normal text-[#9a9a9a]">({league.count} total)</span>
              <span className="text-[#c8c4bc]">›</span>
            </p>
            {league.outrights.length ? (
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                {league.outrights.map((card) => (
                  <article key={card.id} className={`${cardClass} p-4`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1a2a6c] text-[9px] font-medium text-white">
                          UCL
                        </span>
                        <h3 className="font-serif text-[16px] tracking-[-0.02em]">{card.title}</h3>
                      </div>
                      <span className="text-[#c8c4bc]">🔖</span>
                    </div>
                    <ul className="flex flex-col gap-2.5">
                      {card.runners.map((runner) => (
                        <li key={runner.name} className="flex items-center gap-3">
                          <p className="min-w-0 flex-1 truncate text-[13px]">{runner.name}</p>
                          <p className="w-12 text-right text-[13px] font-medium">{runner.chance}%</p>
                          <Link
                            href={`/contract/${runner.marketId}`}
                            className="rounded-md bg-[#f4f2ed] px-2.5 py-1 text-[11px] text-[#6e6e6e] no-underline"
                          >
                            YES
                          </Link>
                          <Link
                            href={`/contract/${runner.marketId}`}
                            className="rounded-md bg-[#f4f2ed] px-2.5 py-1 text-[11px] text-[#6e6e6e] no-underline"
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
                    className={`${cardClass} w-[250px] shrink-0 p-4 no-underline`}
                  >
                    <p className="mb-3 text-center text-[11px] text-[#9a9a9a]">{match.when}</p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <CrestMark crest={match.home.crest} />
                        <p className="text-[13px] font-medium">{match.home.name}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-serif text-[22px] tracking-[-0.04em]">{match.kickoff.split(" ")[0]}</p>
                        <p className="text-[11px] text-[#9a9a9a]">{match.kickoff.split(" ")[1]}</p>
                      </div>
                      <div className="flex flex-col items-center gap-2 text-center">
                        <CrestMark crest={match.away.crest} />
                        <p className="text-[13px] font-medium">{match.away.name}</p>
                      </div>
                    </div>
                    <div
                      className={`mt-4 grid gap-1.5 text-center text-[11px] ${
                        match.draw == null ? "grid-cols-2" : "grid-cols-3"
                      }`}
                    >
                      <div className="rounded-lg bg-[#f4f2ed] px-1 py-2">
                        <p className="font-medium text-[#1a1a1a]">{match.home.chance}%</p>
                        <p className="mt-1 text-[#8a8a8a]">{oddFromChance(match.home.chance)}</p>
                      </div>
                      {match.draw != null ? (
                        <div className="rounded-lg bg-[#f4f2ed] px-1 py-2">
                          <p className="font-medium text-[#1a1a1a]">DRAW {match.draw}%</p>
                          <p className="mt-1 text-[#8a8a8a]">{oddFromChance(match.draw)}</p>
                        </div>
                      ) : null}
                      <div className="rounded-lg bg-[#f4f2ed] px-1 py-2">
                        <p className="font-medium text-[#1a1a1a]">{match.away.chance}%</p>
                        <p className="mt-1 text-[#8a8a8a]">{oddFromChance(match.away.chance)}</p>
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
