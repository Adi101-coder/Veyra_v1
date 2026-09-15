"use client";

import Link from "next/link";
import { categoryColor, categoryLabel, type Market } from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";

type ContractListProps = {
  markets: Market[];
  query: string;
  onQuery: (value: string) => void;
};

export function ContractList({ markets, query, onQuery }: ContractListProps) {
  return (
    <section className="pt-10 pb-16 sm:pt-14">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-[26px] tracking-[-0.02em] text-[#1a1a1a] sm:text-[30px]">
          More Contracts
        </h2>
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-[280px] sm:flex-none">
            <span className="sr-only">Search by keyword</span>
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search by keyword..."
              className="w-full rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-4 py-2 text-sm text-[#1a1a1a] outline-none placeholder:text-[#b0b0b0] focus:border-[#1a1a1a]"
            />
          </label>
          <span className="hidden rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e6e] sm:inline">
            Keyword ▾
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {markets.map((market) => {
          const color = categoryColor(market.category);
          return (
            <li key={market.id}>
              <Link
                href={`/contract/${market.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-[rgba(26,26,26,0.08)] bg-[#fbfaf7] px-4 py-3.5 no-underline transition hover:border-[rgba(26,26,26,0.16)] hover:bg-white sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <Identicon seed={market.id} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-[17px] tracking-[-0.02em] text-[#1a1a1a] sm:text-[18px]">
                    {market.title}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: color }}
                      />
                      {categoryLabel(market.category)}
                    </span>
                    <span>#{market.tag}</span>
                    <span>
                      {market.wagers} {market.wagers === 1 ? "Wager" : "Wagers"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-6 sm:flex-col sm:items-end sm:justify-center">
                  <p className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#5a5a5a]">
                    <span aria-hidden>◷</span>
                    {market.resolvesIn} left
                  </p>
                  <p className="font-mono text-[10px] text-[#9a9a9a]">
                    {market.resolvesAt}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {markets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[rgba(26,26,26,0.14)] px-6 py-12 text-center text-sm text-[#6e6e6e]">
          No contracts match that filter.
        </p>
      ) : null}
    </section>
  );
}
