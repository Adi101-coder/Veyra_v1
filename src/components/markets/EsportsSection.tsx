"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { oddFromChance, esportMatches, esportTabs, type EsportTab } from "@/lib/market-feed";
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
        sample
        count={esportMatches.length}
        extra={<PillTabs tabs={esportTabs} value={tab} onChange={setTab} />}
      />
      {matches.length === 0 ? (
        <p className={`${cardClass} px-5 py-12 text-center text-[14px] text-[#8b887f]`}>
          No {esportTabs.find((item) => item.id === tab)?.label} markets right now.
        </p>
      ) : (
        <HorizontalRail>
          {matches.map((match, index) => {
            const homeLead = match.home.chance >= match.away.chance;
            return (
              <Link
                key={`${match.marketId}-${index}`}
                href={`/contract/${match.marketId}`}
                className={`${cardClass} w-[260px] shrink-0 p-5 no-underline`}
              >
                {match.live ? (
                  <p className="mb-4 flex items-center justify-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-[#c45c6a]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c45c6a]" />
                    LIVE
                  </p>
                ) : (
                  <p className="mb-4 text-center text-[12px] font-medium text-[#8b887f]">
                    {match.when}
                    {match.kickoff ? ` · ${match.kickoff}` : ""}
                  </p>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CrestMark crest={{ ...match.home.crest, shape: "hex" }} />
                    <p className="text-[13px] font-semibold">{match.home.name}</p>
                  </div>
                  {match.live ? (
                    <p className="text-[24px] font-semibold tracking-[-0.05em]">
                      {match.live.home} : {match.live.away}
                    </p>
                  ) : match.kickoff ? (
                    <div className="text-center">
                      <p className="text-[20px] font-semibold tracking-[-0.05em]">
                        {match.kickoff.split(" ")[0]}
                      </p>
                      <p className="text-[11px] font-medium text-[#8b887f]">{match.kickoff.split(" ")[1]}</p>
                    </div>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f2ec] text-[11px] font-medium text-[#8b887f]">
                      vs
                    </span>
                  )}
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CrestMark crest={{ ...match.away.crest, shape: "hex" }} />
                    <p className="text-[13px] font-semibold">{match.away.name}</p>
                  </div>
                </div>
                {match.live ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg border border-black/[0.06] py-2.5">
                      <p className="text-[14px] font-semibold tabular-nums">{match.home.chance}%</p>
                      <p className="text-[11px] text-[#8b887f]">{oddFromChance(match.home.chance)}</p>
                    </div>
                    <div className="rounded-lg border border-black/[0.06] py-2.5">
                      <p className="text-[14px] font-semibold tabular-nums">{match.away.chance}%</p>
                      <p className="text-[11px] text-[#8b887f]">{oddFromChance(match.away.chance)}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f4f2ec]">
                      <div
                        className={`h-full ${homeLead ? "bg-[#0f854f]" : "bg-[#c45c6a]"}`}
                        style={{ width: `${Math.min(match.home.chance, 92)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-[#8b887f]">
                      <span>{match.home.chance}% chance</span>
                      <span>{match.away.chance}%</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg bg-[#f4f2ec] py-2 text-[13px] font-semibold tabular-nums">
                        {match.home.chance}%
                      </div>
                      <div className="rounded-lg bg-[#f4f2ec] py-2 text-[13px] font-semibold tabular-nums">
                        {match.away.chance}%
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-center text-[11px] text-[#8b887f]">
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
