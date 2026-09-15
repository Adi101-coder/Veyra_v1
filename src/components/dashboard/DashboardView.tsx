"use client";

import { useMemo, useState } from "react";
import { ContractList } from "@/components/dashboard/ContractList";
import { FeaturedMarket } from "@/components/dashboard/FeaturedMarket";
import { Shell } from "@/components/Shell";
import {
  categories,
  filterMarkets,
  markets,
  tabs,
  type CategoryId,
  type TabId,
} from "@/lib/markets";

export function DashboardView() {
  const [tab, setTab] = useState<TabId>("trending");
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => filterMarkets(markets, tab, category, query),
    [tab, category, query],
  );

  const featured = useMemo(() => {
    const preferred = visible.filter((market) => market.featured);
    const pool = preferred.length ? preferred : visible;
    return pool.slice(0, 3);
  }, [visible]);

  return (
    <div className="bg-[#f3f1ec]">
      <Shell className="pt-6 pb-8 sm:pt-8">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition sm:text-[11px] ${
                  active
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-transparent text-[#7a7a7a] hover:text-[#1a1a1a]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => {
            const active = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] whitespace-nowrap transition ${
                  active
                    ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                    : "border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a] hover:border-[rgba(26,26,26,0.2)]"
                }`}
              >
                {item.id !== "all" ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: active ? "#fff" : item.color }}
                  />
                ) : null}
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <FeaturedMarket key={featured.map((item) => item.id).join("-")} markets={featured} />
        </div>

        <ContractList markets={visible} query={query} onQuery={setQuery} />
      </Shell>
    </div>
  );
}
