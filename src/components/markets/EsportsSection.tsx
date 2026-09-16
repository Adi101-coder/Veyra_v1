"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { esportMatches, esportTabs, oddFromChance, type EsportTab } from "@/lib/market-feed";
import { cardClass, CrestMark, HorizontalRail, PillTabs, SectionHead } from "@/components/markets/primitives";

export function EsportsSection() {
  const [tab, setTab] = useState<EsportTab>("all");
  const matches = useMemo(
    () => (tab === "all" ? esportMatches : esportMatches.filter((match) => match.game === tab)),
    [tab],
  );

  return (
    <section id="esports" className="scroll-mt-24">
      <SectionHead
        title="Esports"
        count={esportMatches.length}
        extra={<PillTabs tabs={esportTabs} value={tab} onChange={setTab} />}
      />
      {matches.length === 0 ? (
        <p className={`${cardClass} px-5 py-10 text-center text-sm text-[#8a8a8a]`}>
          No live {esportTabs.find((item) => item.id === tab)?.label} markets right now.
        </p>
      ) : (
        <HorizontalRail>
          {matches.map((match, index) => {
            const homeLead = match.home.chance >= match.away.chance;
            return (
              <Link
                key={`${match.marketId}-${index}`}
                href={`/contract/${match.marketId}`}
                className={`${cardClass} w-[250px] shrink-0 p-4 no-underline`}
              >
                {match.live ? (
                  <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#c45c6a]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c45c6a]" />
                    LIVE
                  </p>
                ) : (
                  <p className="mb-3 text-center text-[11px] text-[#9a9a9a]">
                    {match.when}
                    {match.kickoff ? ` · ${match.kickoff}` : ""}
                  </p>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CrestMark crest={match.home.crest} />
                    <p className="text-[13px] font-medium">{match.home.name}</p>
                  </div>
                  {match.live ? (
                    <p className="font-serif text-[22px] tracking-[-0.04em]">
                      {match.live.home} : {match.live.away}
                    </p>
                  ) : match.kickoff ? (
                    <div className="text-center">
                      <p className="font-serif text-[20px] tracking-[-0.04em]">
                        {match.kickoff.split(" ")[0]}
                      </p>
                      <p className="text-[11px] text-[#9a9a9a]">{match.kickoff.split(" ")[1]}</p>
                    </div>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f2ed] text-[11px] text-[#8a8a8a]">
                      vs
                    </span>
                  )}
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CrestMark crest={match.away.crest} />
                    <p className="text-[13px] font-medium">{match.away.name}</p>
                  </div>
                </div>
                {match.live ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[12px]">
                    <div className="rounded-lg border border-[rgba(26,26,26,0.08)] py-2">
                      <p className="font-medium">{match.home.chance}%</p>
                      <p className="text-[#8a8a8a]">{oddFromChance(match.home.chance)}</p>
                    </div>
                    <div className="rounded-lg border border-[rgba(26,26,26,0.08)] py-2">
                      <p className="font-medium">{match.away.chance}%</p>
                      <p className="text-[#8a8a8a]">{oddFromChance(match.away.chance)}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f4f2ed]">
                      <div
                        className={`h-full ${homeLead ? "bg-[#2f9e6e]" : "bg-[#c45c6a]"}`}
                        style={{ width: `${Math.min(match.home.chance, 92)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-[#8a8a8a]">
                      <span>{match.home.chance}% chance</span>
                      <span>{match.away.chance}%</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[12px]">
                      <div className="rounded-lg bg-[#f4f2ed] py-2 font-medium">{match.home.chance}%</div>
                      <div className="rounded-lg bg-[#f4f2ed] py-2 font-medium">{match.away.chance}%</div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-center text-[11px] text-[#8a8a8a]">
                      <span>{oddFromChance(match.home.chance)}</span>
                      <span>{oddFromChance(match.away.chance)}</span>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </HorizontalRail>
      )}
    </section>
  );
}
