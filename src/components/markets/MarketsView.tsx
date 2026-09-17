"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Shell } from "@/components/Shell";
import { FeaturedEvent } from "@/components/markets/FeaturedEvent";
import { PacksRow } from "@/components/markets/PacksRow";
import { Leaderboards } from "@/components/markets/Leaderboards";
import { TrendingPositions } from "@/components/markets/TrendingPositions";
import { SportSection } from "@/components/markets/SportSection";
import { EsportsSection } from "@/components/markets/EsportsSection";
import { cardClass, SampleBadge } from "@/components/markets/primitives";
import {
  channelMarketFilter,
  feedChannels,
  type FeedChannel,
} from "@/lib/market-feed";
import { categoryLabel, markets } from "@/lib/markets";

export function MarketsView() {
  const [channel, setChannel] = useState<FeedChannel>("all");
  const [query, setQuery] = useState("");

  const catalog = useMemo(() => {
    if (channel === "all") return [];
    const list = markets.filter(channelMarketFilter[channel]);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((market) => market.title.toLowerCase().includes(q));
  }, [channel, query]);

  const showHero = channel === "all" || channel === "sport";
  const showPacks = channel === "all" || channel === "sport";
  const showBoards = channel === "all";
  const showSport = channel === "all" || channel === "sport";
  const showEsports = channel === "all" || channel === "esports";
  const showCatalog = channel !== "all" && channel !== "sport" && channel !== "esports";

  return (
    <div className="bg-[#f3f1eb]">
      <Shell className="pt-3 pb-20 sm:pt-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {feedChannels.map((item) => {
              const active = item.id === channel;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChannel(item.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? "bg-[#171717] text-white"
                      : "bg-white text-[#5f5c55] hover:text-[#171717]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <label className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#8b887f]" />
            <span className="sr-only">Search markets</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets"
              className="h-9 w-full rounded-full border border-black/[0.07] bg-white pr-3 pl-9 text-[13px] text-[#171717] outline-none placeholder:text-[#b0ada4] focus:border-black/20"
            />
          </label>
        </div>

        <div className="flex flex-col gap-11">
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
              <h2 className="mb-4 flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em] text-[#171717]">
                {feedChannels.find((item) => item.id === channel)?.label}
                <SampleBadge />
              </h2>
              {catalog.length === 0 ? (
                <p className={`${cardClass} px-5 py-12 text-center text-[14px] text-[#8b887f]`}>
                  Nothing in this channel yet.
                </p>
              ) : (
                <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {catalog.map((market) => {
                    const yes = market.seats.find((seat) => seat.side === "lands")?.chance ?? 50;
                    return (
                      <li key={market.id}>
                        <Link
                          href={`/contract/${market.id}`}
                          className={`${cardClass} flex h-full flex-col p-5 no-underline`}
                        >
                          <p className="text-[11px] font-medium tracking-[0.08em] text-[#8b887f] uppercase">
                            {categoryLabel(market.category)} · {market.resolvesIn} left
                          </p>
                          <h3 className="mt-2 text-[16px] leading-snug font-semibold tracking-[-0.03em] text-[#171717]">
                            {market.title}
                          </h3>
                          <div className="mt-5 grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-[#e8f6ee] px-3 py-2.5">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0f854f]">
                                YES
                              </p>
                              <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#171717]">
                                {yes}%
                              </p>
                            </div>
                            <div className="rounded-xl bg-[#f8e8ea] px-3 py-2.5">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-[#c45c6a]">
                                NO
                              </p>
                              <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#171717]">
                                {100 - yes}%
                              </p>
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
