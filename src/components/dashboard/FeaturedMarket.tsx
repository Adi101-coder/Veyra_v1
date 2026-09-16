"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  categoryColor,
  categoryLabel,
  formatUsdCompact,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";
import { getMarketConviction } from "@/lib/betting-api";
import { formatDivergence, type MarketConviction } from "@/lib/conviction";

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
  const [conviction, setConviction] = useState<MarketConviction | null>(null);

  useEffect(() => {
    if (!market) {
      setConviction(null);
      return;
    }
    let cancelled = false;
    setConviction(null);
    void getMarketConviction(market.id)
      .then((payload) => {
        if (!cancelled) setConviction(payload);
      })
      .catch(() => {
        if (!cancelled) setConviction(null);
      });
    return () => {
      cancelled = true;
    };
  }, [market?.id]);

  const table = useMemo(() => {
    if (!market) return undefined;
    return (
      market.tableOptions.find((item) => item.id === tableId) ??
      market.tableOptions[0]
    );
  }, [market, tableId]);

  if (!market || !table) {
    return (
      <div className="rounded-[22px] border border-[rgba(23,22,20,0.1)] bg-[#fffcf7] px-6 py-16 text-center text-sm text-[#7a746a]">
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
  };

  return (
    <article className="overflow-hidden rounded-[22px] border border-[rgba(23,22,20,0.08)] bg-[#fffcf7] shadow-[0_18px_50px_-32px_rgba(23,22,20,0.55)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20.5rem]">
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a746a]">
              {market.image ? (
                <span className="relative h-5 w-5 overflow-hidden rounded-md">
                  <Image src={market.image} alt="" fill sizes="20px" className="object-cover" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              )}
              {categoryLabel(market.category)}
              {market.live ? (
                <span className="rounded-full bg-[#e8f3ec] px-2 py-0.5 text-[#2c7a55]">Live</span>
              ) : (
                <span className="text-[#b0a99c]">#{market.tag}</span>
              )}
            </p>
            <Link
              href={`/contract/${market.id}`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a] no-underline transition hover:text-[#1a1a1a]"
            >
              View contract
            </Link>
          </div>

          <h2 className="max-w-[36rem] font-serif text-[26px] leading-[1.2] tracking-[-0.03em] text-[#171614] sm:text-[30px]">
            <Link href={`/contract/${market.id}`} className="text-inherit no-underline">
              {market.title}
            </Link>
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[rgba(23,22,20,0.08)] bg-[rgba(23,22,20,0.08)] sm:grid-cols-4">
            {(market.live
              ? [
                  ["Volume", market.volumeUsd ? formatUsdCompact(market.volumeUsd) : market.staked],
                  ["24h", market.volume24hrUsd ? formatUsdCompact(market.volume24hrUsd) : "—"],
                  [
                    "Liquidity",
                    market.liquidityUsd ? formatUsdCompact(market.liquidityUsd) : String(market.tables),
                  ],
                  ["Resolves in", market.resolvesIn],
                ]
              : [
                  ["Staked", market.staked],
                  ["Tables", String(market.tables)],
                  ["Open seats", String(market.openSeats)],
                  ["Resolves in", market.resolvesIn],
                ]
            ).map(([label, value]) => (
              <div key={label} className="bg-[#fffcf7] px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a847a]">
                  {label}
                </p>
                <p className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#171614]">
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
                    Seat {market.live ? (seat.side === "lands" ? "Yes" : "No") : seat.id}
                  </p>
                  <p className="truncate font-mono text-[12px] text-[#1a1a1a]">
                    {seat.wallet}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[18px] font-medium tracking-[-0.03em] ${
                      seat.side === "lands" ? "text-[#2c7a55]" : "text-[#b4454a]"
                    }`}
                  >
                    {seat.chance}¢
                  </p>
                  <p
                    className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                      seat.side === "lands" ? "text-[#2c7a55]" : "text-[#b4454a]"
                    }`}
                  >
                    {seat.side === "lands" ? "Yes" : "No"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              <span>Certainty on this table</span>
              <span>
                {conviction
                  ? `${conviction.participants} ${conviction.participants === 1 ? "bet" : "bets"}`
                  : "2 bets"}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[#efe8dc]">
              <span
                className="absolute inset-y-0 left-0 bg-[#b4454a]/25"
                style={{ width: `${miss?.chance ?? 50}%` }}
              />
              <span
                className="absolute inset-y-0 right-0 bg-[#2c7a55]/30"
                style={{ width: `${land.chance}%` }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#b4454a] ring-2 ring-white"
                style={{
                  left:
                    conviction?.conviction != null
                      ? `${Math.max(2, Math.min(96, 100 - conviction.conviction))}%`
                      : "8%",
                }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#2c7a55] ring-2 ring-white"
                style={{
                  left:
                    conviction?.conviction != null
                      ? `${Math.max(2, Math.min(96, conviction.conviction))}%`
                      : undefined,
                  right: conviction?.conviction != null ? undefined : "10%",
                }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em]">
              <span className="text-[#b4454a]">No · {miss?.chance ?? 0}¢</span>
              <span className="text-[#2c7a55]">Yes · {land.chance}¢</span>
            </div>
            <p className="mt-2 text-[11px] text-[#9a9a9a]">
              {conviction?.conviction != null
                ? `Veyra ${Math.round(conviction.conviction)}% · Polymarket ${Math.round(conviction.polymarketProbability)}% · ${formatDivergence(conviction.divergence)} divergence`
                : "Each dot matches a player's avatar"}
            </p>
          </div>
        </div>

        <aside className="border-t border-[rgba(23,22,20,0.08)] bg-[#efebe3] px-5 py-5 lg:border-t-0 lg:border-l">
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
            <div className="rounded-xl bg-[#e8f3ec] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#2c7a55]">
                If yes
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#5a5a5a]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#2c7a55]">+{landSwing} SOL</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#5a5a5a]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#b4454a]">-{landSwing} SOL</p>
            </div>
            <div className="rounded-xl bg-[#f6e9ea] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#b4454a]">
                If no
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#5a5a5a]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#b4454a]">-{missSwing} SOL</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#5a5a5a]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#2c7a55]">+{missSwing} SOL</p>
            </div>
          </div>

          <Link
            href={`/contract/${market.id}/wager/${market.id}-w1`}
            className="mt-5 block w-full rounded-full bg-[#171614] px-4 py-3 text-center text-[14px] font-medium text-[#f4f1ea] no-underline transition hover:bg-black"
          >
            Watch this wager →
          </Link>
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
