"use client";

import { useMemo, useState } from "react";
import { ContractList } from "@/components/dashboard/ContractList";
import { FeaturedMarket } from "@/components/dashboard/FeaturedMarket";
import { Shell } from "@/components/Shell";
import {
  categories,
  coreMarkets,
  filterMarkets,
  tabs,
  type CategoryId,
  type TabId,
} from "@/lib/markets";

export function DashboardView() {
  const [tab, setTab] = useState<TabId>("trending");
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => filterMarkets(coreMarkets, tab, category, query),
    [tab, category, query],
  );

  const featured = useMemo(() => {
    const preferred = visible.filter((market) => market.featured);
    const pool = preferred.length ? preferred : visible;
    return pool.slice(0, 3);
  }, [visible]);

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="pt-5 pb-8 sm:pt-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-7">
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`font-serif text-[12px] uppercase tracking-[0.14em] transition sm:text-[13px] ${
                  active
                    ? "rounded-full bg-[#2a2a2a] px-4 py-1.5 text-white"
                    : "px-1 py-1.5 text-[#8a8a8a] hover:text-[#1a1a1a]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => {
            const active = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-serif text-[13px] whitespace-nowrap transition ${
                  active
                    ? "border-[#2a2a2a] bg-[#2a2a2a] text-white"
                    : "border-[rgba(26,26,26,0.12)] bg-[#fbfaf6] text-[#4a4a4a] hover:border-[rgba(26,26,26,0.22)]"
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
