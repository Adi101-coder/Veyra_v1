"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";
import { FeaturedEvent } from "@/components/markets/FeaturedEvent";
import { PacksRow } from "@/components/markets/PacksRow";
import { Leaderboards } from "@/components/markets/Leaderboards";
import { TrendingPositions } from "@/components/markets/TrendingPositions";
import { SportSection } from "@/components/markets/SportSection";
import { EsportsSection } from "@/components/markets/EsportsSection";
import { cardClass } from "@/components/markets/primitives";
import {
  channelMarketFilter,
  feedChannels,
  type FeedChannel,
} from "@/lib/market-feed";
import { categoryLabel, markets } from "@/lib/markets";

export function MarketsView() {
  const [channel, setChannel] = useState<FeedChannel>("all");

  const catalog = useMemo(() => {
    if (channel === "all") return [];
    return markets.filter(channelMarketFilter[channel]);
  }, [channel]);

  const showHero = channel === "all" || channel === "sport";
  const showPacks = channel === "all" || channel === "sport";
  const showBoards = channel === "all";
  const showSport = channel === "all" || channel === "sport";
  const showEsports = channel === "all" || channel === "esports";
  const showCatalog = channel !== "all" && channel !== "sport" && channel !== "esports";

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="pt-4 pb-16 sm:pt-5">
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {feedChannels.map((item) => {
            const active = item.id === channel;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChannel(item.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition ${
                  active
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-white text-[#5a5a5a] hover:text-[#1a1a1a]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-10">
          {showHero ? <FeaturedEvent /> : null}
          {showPacks ? <PacksRow /> : null}
          {showBoards ? (
            <>
              <Leaderboards />
              <TrendingPositions />
            </>
          ) : null}
          {showSport ? <SportSection /> : null}
          {showEsports ? <EsportsSection /> : null}
          {showCatalog ? (
            <section>
              <h2 className="mb-4 font-serif text-[22px] tracking-[-0.03em]">
                {feedChannels.find((item) => item.id === channel)?.label} markets
              </h2>
              {catalog.length === 0 ? (
                <p className={`${cardClass} px-5 py-10 text-center text-sm text-[#8a8a8a]`}>
                  Nothing live in this channel yet.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {catalog.map((market) => {
                    const yes = market.seats.find((seat) => seat.side === "lands")?.chance ?? 50;
                    return (
                      <li key={market.id}>
                        <Link
                          href={`/contract/${market.id}`}
                          className={`${cardClass} flex h-full flex-col p-4 no-underline`}
                        >
                          <div className="flex items-center gap-3">
                            <Identicon seed={market.id} className="h-9 w-9" />
                            <div className="min-w-0">
                              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                                {categoryLabel(market.category)} · {market.resolvesIn} left
                              </p>
                              <h3 className="mt-1 font-serif text-[16px] leading-snug tracking-[-0.02em] text-[#1a1a1a]">
                                {market.title}
                              </h3>
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                            <div className="rounded-lg bg-[#e7f4ec] px-3 py-2">
                              <p className="text-[#2f9e6e]">YES</p>
                              <p className="mt-1 text-[16px] font-medium text-[#1a1a1a]">{yes}%</p>
                            </div>
                            <div className="rounded-lg bg-[#f8e8ea] px-3 py-2">
                              <p className="text-[#c45c6a]">NO</p>
                              <p className="mt-1 text-[16px] font-medium text-[#1a1a1a]">{100 - yes}%</p>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </Shell>
    </div>
  );
}
