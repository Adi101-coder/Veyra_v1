"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Shell } from "@/components/Shell";
import { cardClass } from "@/components/markets/primitives";
import { LiveTape } from "@/components/markets/LiveTape";
import { MarketCard } from "@/components/markets/MarketCard";
import { PoolsSection } from "@/components/markets/PoolsSection";
import {
  channelMarketFilter,
  feedChannels,
  type FeedChannel,
} from "@/lib/market-feed";
import type { Market } from "@/lib/markets";
import { getLiveTrades } from "@/lib/betting-api";
import type { LiveTrade } from "@/lib/polymarket";

export function MarketsView() {
  const [channel, setChannel] = useState<FeedChannel>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<Market[] | null>(null);
  const [feedSource, setFeedSource] = useState<"polymarket" | "local" | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [tapeError, setTapeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadMarkets = () =>
      fetch("/api/markets?limit=80", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((json: { source?: string; markets?: Market[]; error?: string } | null) => {
          if (cancelled) return;
          setLive(json?.markets?.length ? json.markets : []);
          setFeedSource(json?.source === "polymarket" ? "polymarket" : "local");
          setFeedError(json?.source === "polymarket" ? null : (json?.error ?? "Live feed unavailable"));
        })
        .catch(() => {
          if (!cancelled) {
            setLive([]);
            setFeedSource("local");
            setFeedError("Live feed unavailable");
          }
        });
    const loadTrades = () =>
      getLiveTrades({ limit: 16 })
        .then((json) => {
          if (cancelled) return;
          setTrades(json.trades);
          setTapeError(json.error ?? null);
        })
        .catch(() => {
          if (!cancelled) setTapeError("Polymarket trades unavailable");
        });
    void loadMarkets();
    void loadTrades();
    const timer = window.setInterval(() => {
      void loadMarkets();
      void loadTrades();
    }, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(() => {
    const rows = live ?? [];
    const filtered = channel === "all" ? rows : rows.filter(channelMarketFilter[channel]);
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (market) => market.title.toLowerCase().includes(q) || market.tag.toLowerCase().includes(q),
    );
  }, [live, channel, query]);

  return (
    <div className="bg-[#f1f6ff]">
      <Shell className="pt-3 pb-20 sm:pt-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="scroll-x -mx-4 gap-1.5 px-4 pb-0.5 sm:mx-0 sm:px-0">
            {feedChannels.map((item) => {
              const active = item.id === channel;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChannel(item.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? "bg-[#265bff] text-white"
                      : "bg-white text-[#536780] hover:text-[#182d4a]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <label className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#65758b]" />
            <span className="sr-only">Search markets</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets"
              className="h-9 w-full rounded-full border border-[#dce5f1] bg-white pr-3 pl-9 text-[13px] text-[#182d4a] outline-none placeholder:text-[#83a6e9] focus:border-[#265bff]"
            />
          </label>
        </div>

        <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
          {feedSource === "polymarket" ? "Live · Polymarket" : live === null ? "Syncing markets" : "Demo catalog · paper only"}
          {feedError ? ` · ${feedError}` : null}
        </p>

        <div className="flex flex-col gap-11">
          <PoolsSection />
          {live && visible.length === 0 ? (
            <p className={`${cardClass} px-5 py-12 text-center text-[14px] text-[#65758b]`}>
              No live Polymarket markets in this channel. Vote to create a Veyra pool.
            </p>
          ) : null}
          {visible.length > 0 ? (
            <section>
              <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.03em] text-[#182d4a]">
                {feedSource === "polymarket" ? "Live markets" : "Catalog markets"}
              </h2>
              <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((market) => (
                  <li key={market.id} className="h-full">
                    <MarketCard market={market} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <LiveTape trades={trades} loading={live === null} error={tapeError} />
        </div>
      </Shell>
    </div>
  );
}
