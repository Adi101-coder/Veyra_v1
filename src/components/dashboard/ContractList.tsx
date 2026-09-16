"use client";

import Link from "next/link";
import Image from "next/image";
import {
  categoryColor,
  categoryLabel,
  formatUsdCompact,
  yesChance,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";

type ContractListProps = {
  markets: Market[];
  query: string;
  onQuery: (value: string) => void;
  live?: boolean;
};

function Thumb({ market }: { market: Market }) {
  if (market.image) {
    return (
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-[rgba(23,22,20,0.08)] bg-white">
        <Image src={market.image} alt="" fill sizes="44px" className="object-cover" />
      </span>
    );
  }
  return <Identicon seed={market.id} className="h-11 w-11 shrink-0 rounded-2xl" />;
}

export function ContractList({ markets, query, onQuery, live }: ContractListProps) {
  return (
    <section className="pt-10 pb-16 sm:pt-14">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-[26px] tracking-[-0.03em] text-[#171614] sm:text-[30px]">
            More Contracts
          </h2>
          <p className="mt-1 text-[13px] text-[#7a746a]">
            {live ? "Live odds and volume from Polymarket." : "Local discovery book."}
          </p>
        </div>
        <label className="relative min-w-0 sm:w-[300px]">
          <span className="sr-only">Search by keyword</span>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search markets..."
            className="w-full rounded-full border border-[rgba(23,22,20,0.1)] bg-[#fffcf7] px-4 py-2.5 text-sm text-[#171614] outline-none placeholder:text-[#b0a99c] focus:border-[#171614]"
          />
        </label>
      </div>

      <ul className="flex flex-col gap-2.5">
        {markets.map((market) => {
          const color = categoryColor(market.category);
          const yes = yesChance(market);
          const no = Math.max(1, 100 - yes);
          return (
            <li key={market.id}>
              <Link
                href={`/contract/${market.id}`}
                className="group flex flex-col gap-4 rounded-[20px] border border-[rgba(23,22,20,0.08)] bg-[#fffcf7] px-4 py-4 no-underline shadow-[0_10px_30px_-24px_rgba(23,22,20,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(23,22,20,0.16)] hover:bg-white sm:flex-row sm:items-center sm:gap-5 sm:px-5"
              >
                <Thumb market={market} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-[17px] leading-snug tracking-[-0.03em] text-[#171614] sm:text-[18px]">
                    {market.title}
                  </h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a847a]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {categoryLabel(market.category)}
                    </span>
                    {market.volumeUsd ? <span>{formatUsdCompact(market.volumeUsd)} vol</span> : null}
                    {market.volume24hrUsd ? (
                      <span>{formatUsdCompact(market.volume24hrUsd)} 24h</span>
                    ) : (
                      <span>
                        {market.wagers} {market.wagers === 1 ? "wager" : "wagers"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto sm:min-w-[220px]">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium">
                      <span className="text-[#2c7a55]">Yes {yes}¢</span>
                      <span className="text-[#b4454a]">No {no}¢</span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-[#efe8dc]">
                      <span className="h-full bg-[#2c7a55]" style={{ width: `${yes}%` }} />
                      <span className="h-full bg-[#b4454a]" style={{ width: `${no}%` }} />
                    </div>
                  </div>
                  <p className="w-[4.5rem] text-right font-mono text-[11px] text-[#7a746a]">
                    {market.resolvesIn} left
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {markets.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-[rgba(23,22,20,0.14)] bg-[#fffcf7] px-6 py-12 text-center text-sm text-[#7a746a]">
          No contracts match that filter.
        </p>
      ) : null}
    </section>
  );
}
