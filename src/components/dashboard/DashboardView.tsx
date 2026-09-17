"use client";

import { useEffect, useMemo, useState } from "react";
import { ContractList } from "@/components/dashboard/ContractList";
import { FeaturedMarket } from "@/components/dashboard/FeaturedMarket";
import { Shell } from "@/components/Shell";
import {
  categories,
  coreMarkets,
  filterMarkets,
  tabs,
  type CategoryId,
  type Market,
  type TabId,
} from "@/lib/markets";

export function DashboardView() {
  const [tab, setTab] = useState<TabId>("trending");
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [source, setSource] = useState<"local" | "polymarket">("local");
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallback = (message: string) => {
      setMarkets(coreMarkets);
      setSource("local");
      setFeedError(message);
    };
    const load = async () => {
      try {
        const response = await fetch("/api/markets", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) fallback(`Live feed unavailable (HTTP ${response.status})`);
          return;
        }
        const json = (await response.json()) as {
          source?: "local" | "polymarket";
          markets?: Market[];
          error?: string;
        };
        if (cancelled) return;
        if (json.source === "polymarket" && json.markets?.length) {
          setMarkets(json.markets);
          setSource("polymarket");
          setFeedError(null);
        } else {
          setMarkets(json.markets?.length ? json.markets : coreMarkets);
          setSource("local");
          setFeedError(json.error ?? "Live feed unavailable");
        }
      } catch {
        if (!cancelled) fallback("Live feed unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(
    () => filterMarkets(markets, tab, category, query),
    [markets, tab, category, query],
  );

  const featured = useMemo(() => {
    const preferred = visible.filter((market) => market.featured);
    const pool = preferred.length ? preferred : visible;
    return pool.slice(0, 4);
  }, [visible]);

  return (
    <div className="bg-[#f3f0e8]">
      <Shell className="pt-5 pb-8 sm:pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-7">
            {tabs.map((item) => {
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`text-[12px] uppercase tracking-[0.14em] transition sm:text-[13px] ${
                    active
                      ? "rounded-full bg-[#171614] px-4 py-1.5 text-[#f4f1ea]"
                      : "px-1 py-1.5 text-[#7a746a] hover:text-[#171614]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a746a]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                source === "polymarket" ? "bg-[#2c7a55]" : "bg-[#b58a2a]"
              }`}
            />
            {loading ? "Syncing markets" : source === "polymarket" ? "Live · Polymarket" : "Demo catalog · paper only"}
          </p>
        </div>

        {!loading && feedError ? (
          <p className="-mt-2 mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b58a2a]">
            {feedError} · showing demo catalog
          </p>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => {
            const active = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap transition ${
                  active
                    ? "border-[#171614] bg-[#171614] text-[#f4f1ea]"
                    : "border-[rgba(23,22,20,0.1)] bg-[#fbfaf6] text-[#4f4a43] hover:border-[rgba(23,22,20,0.22)]"
                }`}
              >
                {item.id !== "all" ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: active ? "#f4f1ea" : item.color }}
                  />
                ) : null}
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {loading && !markets.length ? (
            <div className="h-[28rem] animate-pulse rounded-[22px] border border-[rgba(23,22,20,0.08)] bg-[#fbfaf6]" />
          ) : (
            <FeaturedMarket key={featured.map((item) => item.id).join("-")} markets={featured} />
          )}
        </div>

        <ContractList markets={visible} query={query} onQuery={setQuery} live={source === "polymarket"} />
      </Shell>
    </div>
  );
}
