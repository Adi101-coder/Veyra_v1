"use client";

import { useMemo, useState } from "react";
import {
  categoryColor,
  categoryLabel,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";

type FeaturedMarketProps = {
  markets: Market[];
};

function swing(stake: number, chance: number) {
  const implied = Math.max(0.05, Math.min(0.95, chance / 100));
  const amount = stake * (1 - implied);
  return amount.toFixed(4);
}

export function FeaturedMarket({ markets }: FeaturedMarketProps) {
  const slides = markets.length ? markets : [];
  const [index, setIndex] = useState(0);
  const market = slides[index] ?? slides[0];
  const [tableId, setTableId] = useState(market?.tableOptions[0]?.id ?? "");
  const [watching, setWatching] = useState(false);

  const table = useMemo(() => {
    if (!market) return undefined;
    return (
      market.tableOptions.find((item) => item.id === tableId) ??
      market.tableOptions[0]
    );
  }, [market, tableId]);

  if (!market || !table) {
    return (
      <div className="rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-6 py-16 text-center text-sm text-[#6e6e6e]">
        No live markets in this view.
      </div>
    );
  }

  const stake = parseFloat(table.stake);
  const land = market.seats.find((s) => s.side === "lands") ?? market.seats[0];
  const miss = market.seats.find((s) => s.side === "misses") ?? market.seats[1];
  const landSwing = swing(stake, land.chance);
  const missSwing = swing(stake, miss?.chance ?? 50);
  const bothTaken = market.seats.every((seat) => seat.wallet !== "Open seat");
  const color = categoryColor(market.category);

  const go = (dir: -1 | 1) => {
    if (!slides.length) return;
    const next = (index + dir + slides.length) % slides.length;
    setIndex(next);
    setTableId(slides[next].tableOptions[0]?.id ?? "");
    setWatching(false);
  };

  return (
    <article
      className="overflow-hidden rounded-[18px] border border-[rgba(26,26,26,0.08)] bg-[#fbfaf7] shadow-[0_12px_40px_-28px_rgba(26,26,26,0.35)]"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20.5rem]">
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e6e]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
              {categoryLabel(market.category)}
              <span className="text-[#b0b0b0]">#{market.tag}</span>
            </p>
            <button
              type="button"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a] transition hover:text-accent"
            >
              View contract
            </button>
          </div>

          <h2 className="max-w-[36rem] font-serif text-[26px] leading-[1.2] tracking-[-0.02em] text-[#1a1a1a] sm:text-[30px]">
            {market.title}
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[rgba(26,26,26,0.08)] bg-[rgba(26,26,26,0.08)] sm:grid-cols-4">
            {[
              ["Staked", market.staked],
              ["Tables", String(market.tables)],
              ["Open seats", String(market.openSeats)],
              ["Resolves in", market.resolvesIn],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#fbfaf7] px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                  {label}
                </p>
                <p className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#1a1a1a]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Choose a table
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {market.tableOptions.map((option) => {
                  const active = option.id === table.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTableId(option.id)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                        active
                          ? "border-[#1a1a1a] bg-white text-[#1a1a1a]"
                          : "border-transparent bg-white/70 text-[#5a5a5a] hover:border-[rgba(26,26,26,0.16)]"
                      }`}
                    >
                      {option.stake}
                      {option.full ? (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.12em] text-[#9a9a9a]">
                          full
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="rounded-full border border-dashed border-[rgba(26,26,26,0.2)] px-3 py-1.5 text-[12px] text-[#6e6e6e]"
                >
                  + New table
                </button>
              </div>
            </div>
            <p className="font-mono text-[10px] text-[#8a8a8a]">
              stake {table.stake} · against {land.wallet}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {market.seats.map((seat) => (
              <div
                key={seat.id}
                className="flex items-center gap-3 rounded-xl border border-[rgba(26,26,26,0.08)] bg-white px-3 py-3"
              >
                <Identicon seed={seat.avatar} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Seat {seat.id}
                  </p>
                  <p className="truncate font-mono text-[12px] text-[#1a1a1a]">
                    {seat.wallet}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[18px] font-medium tracking-[-0.03em] ${
                      seat.side === "lands" ? "text-[#2f9e6e]" : "text-[#c45c6a]"
                    }`}
                  >
                    {seat.chance}%
                  </p>
                  <p
                    className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                      seat.side === "lands" ? "text-[#2f9e6e]" : "text-[#c45c6a]"
                    }`}
                  >
                    {seat.side === "lands" ? "▲ Lands" : "▼ Misses"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              <span>Certainty on this table</span>
              <span>2 bets</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[linear-gradient(90deg,#f3c1c8_0%,#efe6d6_48%,#b7e0c6_100%)]">
              <span className="absolute top-1/2 left-[8%] h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#c45c6a] ring-2 ring-white" />
              <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-[#1a1a1a]" />
              <span className="absolute top-1/2 right-[10%] h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#2f9e6e] ring-2 ring-white" />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em]">
              <span className="text-[#c45c6a]">Missed · 0%</span>
              <span className="text-[#2f9e6e]">Landed · 100%</span>
            </div>
            <p className="mt-2 text-[11px] text-[#9a9a9a]">
              Each dot matches a player&apos;s avatar
            </p>
          </div>
        </div>

        <aside className="border-t border-[rgba(26,26,26,0.08)] bg-[#f4f2ec] px-5 py-5 lg:border-t-0 lg:border-l">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-[22px] tracking-[-0.02em] text-[#1a1a1a]">
                {bothTaken ? "Table full" : "Seat open"}
              </p>
              <p className="mt-1 text-[13px] text-[#6e6e6e]">
                Stake {table.stake} · {bothTaken ? "both seats taken" : "a seat is still open"}
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#6e6e6e]">
              Spectating
            </span>
          </div>

          <div className="mt-6 flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              On the table
            </p>
            <p className="text-[15px] font-medium">{(stake * 2).toFixed(2)} SOL</p>
          </div>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
            Projected swing
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#e7f4ec] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#2f9e6e]">
                If it lands
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#5a5a5a]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#2f9e6e]">+{landSwing} SOL</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#5a5a5a]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#c45c6a]">-{landSwing} SOL</p>
            </div>
            <div className="rounded-lg bg-[#f8e8ea] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#c45c6a]">
                If it misses
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#5a5a5a]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#c45c6a]">-{missSwing} SOL</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#5a5a5a]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#2f9e6e]">+{missSwing} SOL</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWatching((value) => !value)}
            className="mt-5 w-full rounded-full bg-[#111111] px-4 py-3 text-[14px] font-medium text-white transition hover:bg-black"
          >
            {watching ? "Watching this wager" : "Watch this wager →"}
          </button>
          <p className="mt-3 text-[12px] leading-5 text-[#8a8a8a]">
            Pick another table above, or follow this one to the finish.
          </p>
        </aside>
      </div>

      {slides.length > 1 ? (
        <div className="flex items-center justify-end gap-3 border-t border-[rgba(26,26,26,0.06)] px-5 py-3">
          <button
            type="button"
            aria-label="Previous market"
            onClick={() => go(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.12)] text-sm text-[#5a5a5a]"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5">
            {slides.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.title}`}
                onClick={() => {
                  setIndex(i);
                  setTableId(slides[i].tableOptions[0]?.id ?? "");
                }}
                className={`h-1.5 rounded-full transition ${
                  i === index ? "w-5 bg-[#1a1a1a]" : "w-1.5 bg-[#c8c4bc]"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next market"
            onClick={() => go(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.12)] text-sm text-[#5a5a5a]"
          >
            ›
          </button>
        </div>
      ) : null}
    </article>
  );
}
