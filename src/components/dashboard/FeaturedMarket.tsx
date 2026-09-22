"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  categoryColor,
  categoryLabel,
  formatUsdCompact,
  marketOutcomes,
  type Market,
} from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";
import { OutcomeOdds } from "@/components/markets/OutcomeOdds";
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
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const market = slides[index] ?? slides[0];
  const [tableId, setTableId] = useState(market?.tableOptions[0]?.id ?? "");
  const [convictionState, setConvictionState] = useState<{
    id: string;
    data: MarketConviction | null;
  } | null>(null);
  const marketId = market?.id;
  // Only show conviction fetched for the market currently on screen.
  const conviction = marketId && convictionState?.id === marketId ? convictionState.data : null;

  useEffect(() => {
    if (slides.length < 2 || paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setDirection(1);
      setIndex((current) => (current + 1) % slides.length);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, reduceMotion]);

  useEffect(() => {
    setTableId(slides[index]?.tableOptions[0]?.id ?? "");
  }, [index, slides]);

  useEffect(() => {
    if (!marketId) return;
    let cancelled = false;
    void getMarketConviction(marketId)
      .then((payload) => {
        if (!cancelled) setConvictionState({ id: marketId, data: payload });
      })
      .catch(() => {
        if (!cancelled) setConvictionState({ id: marketId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const table = useMemo(() => {
    if (!market) return undefined;
    return (
      market.tableOptions.find((item) => item.id === tableId) ??
      market.tableOptions[0]
    );
  }, [market, tableId]);

  if (!market) {
    return (
      <div className="rounded-[22px] border border-[rgba(24,45,74,0.1)] bg-[#ffffff] px-6 py-16 text-center text-sm text-[#65758b]">
        No markets in this view.
      </div>
    );
  }

  const stake = table ? parseFloat(table.stake) : 0;
  // Demo catalog stakes carry their own unit string; live markets have no tables.
  const unit = table ? table.stake.replace(/^[\d.,\s]+/, "") : "";
  const outcomes = marketOutcomes(market);
  const land = market.seats.find((s) => s.side === "lands") ?? market.seats[0];
  const miss = market.seats.find((s) => s.side === "misses") ?? market.seats[1];
  const landLabel = land.wallet;
  const missLabel = miss?.wallet ?? "No";
  const landSwing = swing(stake, land.chance);
  const missSwing = swing(stake, miss?.chance ?? 50);
  const bothTaken = market.seats.every((seat) => seat.wallet !== "Open seat");
  const color = categoryColor(market.category);

  const go = (dir: -1 | 1) => {
    if (!slides.length) return;
    const next = (index + dir + slides.length) % slides.length;
    setDirection(dir);
    setIndex(next);
    setTableId(slides[next].tableOptions[0]?.id ?? "");
  };

  return (
    <article
      className="overflow-hidden rounded-[22px] border border-[rgba(24,45,74,0.08)] bg-[#ffffff] shadow-[0_18px_50px_-32px_rgba(24,45,74,0.55)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={market.id}
        custom={direction}
        initial={reduceMotion ? false : { opacity: 0, x: direction * 36 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, x: direction * -28 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.36, 1] }}
        className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20.5rem]"
      >
        <div className="px-4 py-5 sm:px-7 sm:py-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
              {market.image ? (
                <span className="relative h-5 w-5 overflow-hidden rounded-md">
                  <Image src={market.image} alt="" fill sizes="20px" className="object-cover" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              )}
              {categoryLabel(market.category)}
              {market.live ? (
                <span className="rounded-full bg-[#e8f0ff] px-2 py-0.5 text-[#2c7a55]">Live</span>
              ) : (
                <span className="text-[#83a6e9]">#{market.tag}</span>
              )}
            </p>
            <Link
              href={`/contract/${market.id}`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#65758b] no-underline transition hover:text-[#182d4a]"
            >
              View contract
            </Link>
          </div>

          <h2 className="max-w-[36rem] font-serif text-[26px] leading-[1.2] tracking-[-0.03em] text-[#182d4a] sm:text-[30px]">
            <Link href={`/contract/${market.id}`} className="text-inherit no-underline">
              {market.title}
            </Link>
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[rgba(24,45,74,0.08)] bg-[rgba(24,45,74,0.08)] sm:grid-cols-4">
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
              <div key={label} className="bg-[#ffffff] px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
                  {label}
                </p>
                <p className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#182d4a]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {table ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#65758b]">
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
                          ? "border-[#265bff] bg-white text-[#182d4a]"
                          : "border-transparent bg-white/70 text-[#536780] hover:border-[rgba(24,45,74,0.16)]"
                      }`}
                    >
                      {option.stake}
                      {option.full ? (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.12em] text-[#657da0]">
                          full
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <Link
                  href={`/contract/${market.id}`}
                  className="rounded-full border border-dashed border-[rgba(24,45,74,0.2)] px-3 py-1.5 text-[12px] text-[#65758b] no-underline"
                >
                  + New table
                </Link>
              </div>
            </div>
            <p className="font-mono text-[10px] text-[#65758b]">
              stake {table.stake} · against {land.wallet}
            </p>
          </div>
          ) : null}

          {outcomes.length > 2 ? (
            <div className="mt-5 rounded-xl border border-[rgba(24,45,74,0.08)] bg-white px-4 py-4">
              <OutcomeOdds outcomes={outcomes} limit={5} />
            </div>
          ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {market.seats.map((seat) => (
              <div
                key={seat.id}
                className="flex items-center gap-3 rounded-xl border border-[rgba(24,45,74,0.08)] bg-white px-3 py-3"
              >
                <Identicon seed={seat.avatar} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
                    Seat {market.live ? seat.wallet : seat.id}
                  </p>
                  <p className="truncate font-mono text-[12px] text-[#182d4a]">
                    {seat.wallet}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[18px] font-medium tracking-[-0.03em] ${
                      seat.side === "lands" ? "text-[#2c7a55]" : "text-[#ad4c62]"
                    }`}
                  >
                    {seat.chance}¢
                  </p>
                  <p
                    className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                      seat.side === "lands" ? "text-[#2c7a55]" : "text-[#ad4c62]"
                    }`}
                  >
                    {seat.wallet}
                  </p>
                </div>
              </div>
            ))}
          </div>
          )}

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
              <span>Certainty on this table</span>
              <span>
                {conviction
                  ? `${conviction.participants} ${conviction.participants === 1 ? "bet" : "bets"}`
                  : "No bets yet"}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[#e8f0ff]">
              <span
                className="absolute inset-y-0 left-0 bg-[#ad4c62]/25"
                style={{ width: `${miss?.chance ?? 50}%` }}
              />
              <span
                className="absolute inset-y-0 right-0 bg-[#2c7a55]/30"
                style={{ width: `${land.chance}%` }}
              />
              {conviction?.conviction != null ? (
                <>
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#ad4c62] ring-2 ring-white"
                style={{
                  left: `${Math.max(2, Math.min(96, 100 - conviction.conviction))}%`,
                }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#2c7a55] ring-2 ring-white"
                style={{
                  left: `${Math.max(2, Math.min(96, conviction.conviction))}%`,
                }}
              />
                </>
              ) : null}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em]">
              <span className="text-[#ad4c62]">{missLabel} · {miss?.chance ?? 0}¢</span>
              <span className="text-[#2c7a55]">{landLabel} · {land.chance}¢</span>
            </div>
            <p className="mt-2 text-[11px] text-[#657da0]">
              {conviction?.conviction != null
                ? `Split ${Math.round(conviction.conviction)}% · Polymarket ${conviction.polymarketProbability == null ? "—" : `${Math.round(conviction.polymarketProbability)}%`} · ${formatDivergence(conviction.divergence)} divergence`
                : "Each dot matches a player's avatar"}
            </p>
          </div>
        </div>

        <aside className="border-t border-[rgba(24,45,74,0.08)] bg-[#f1f6ff] px-5 py-5 lg:border-t-0 lg:border-l">
          {table ? (
            <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-[22px] tracking-[-0.02em] text-[#182d4a]">
                {bothTaken ? "Table full" : "Seat open"}
              </p>
              <p className="mt-1 text-[13px] text-[#65758b]">
                Stake {table.stake} · {bothTaken ? "both seats taken" : "a seat is still open"}
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
              Spectating
            </span>
          </div>

          <div className="mt-6 flex items-center justify-between border-b border-[rgba(24,45,74,0.08)] pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
              On the table
            </p>
            <p className="text-[15px] font-medium">{(stake * 2).toFixed(2)} {unit}</p>
          </div>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
            Projected swing
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#e8f0ff] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#2c7a55]">
                If {landLabel}
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#536780]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#2c7a55]">+{landSwing} {unit}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#536780]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#ad4c62]">-{landSwing} {unit}</p>
            </div>
            <div className="rounded-xl bg-[#ffeff0] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#ad4c62]">
                If {missLabel}
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-[#536780]">
                {land.wallet}
              </p>
              <p className="text-[12px] text-[#ad4c62]">-{missSwing} {unit}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-[#536780]">
                {miss?.wallet}
              </p>
              <p className="text-[12px] text-[#2c7a55]">+{missSwing} {unit}</p>
            </div>
          </div>

          <Link
            href={`/contract/${market.id}`}
            className="mt-5 block w-full rounded-full bg-[#265bff] px-4 py-3 text-center text-[14px] font-medium text-[#f8fbff] no-underline transition hover:bg-[#1847d8]"
          >
            Watch this wager →
          </Link>
          <p className="mt-3 text-[12px] leading-5 text-[#65758b]">
            Pick another table above, or follow this one to the finish.
          </p>
            </>
          ) : (
            <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-[22px] tracking-[-0.02em] text-[#182d4a]">
                Market odds
              </p>
              <p className="mt-1 text-[13px] text-[#65758b]">
                {landLabel} {land.chance}¢ · {missLabel} {miss?.chance ?? 0}¢
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
              Spectating
            </span>
          </div>

          <div className="mt-6 flex items-center justify-between border-b border-[rgba(24,45,74,0.08)] pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
              Volume
            </p>
            <p className="text-[15px] font-medium">
              {market.volumeUsd ? formatUsdCompact(market.volumeUsd) : "—"}
            </p>
          </div>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
            Market depth
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#e8f0ff] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#2c7a55]">
                24h volume
              </p>
              <p className="mt-2 text-[12px] text-[#2c7a55]">
                {market.volume24hrUsd ? formatUsdCompact(market.volume24hrUsd) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-[#ffeff0] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#ad4c62]">
                Liquidity
              </p>
              <p className="mt-2 text-[12px] text-[#ad4c62]">
                {market.liquidityUsd ? formatUsdCompact(market.liquidityUsd) : "—"}
              </p>
            </div>
          </div>

          <Link
            href={`/contract/${market.id}`}
            className="mt-5 block w-full rounded-full bg-[#265bff] px-4 py-3 text-center text-[14px] font-medium text-[#f8fbff] no-underline transition hover:bg-[#1847d8]"
          >
            Open contract →
          </Link>
          <p className="mt-3 text-[12px] leading-5 text-[#65758b]">
            Prices from Polymarket. Stakes on Split are in USD.
          </p>
            </>
          )}
        </aside>
      </motion.div>
      </AnimatePresence>
      </div>

      {slides.length > 1 ? (
        <div className="flex items-center justify-end gap-3 border-t border-[rgba(24,45,74,0.06)] px-5 py-3">
          <button
            type="button"
            aria-label="Previous market"
            onClick={() => go(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(24,45,74,0.12)] text-sm text-[#536780]"
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
                  setDirection(i > index ? 1 : -1);
                  setIndex(i);
                  setTableId(slides[i].tableOptions[0]?.id ?? "");
                }}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === index ? "w-5 bg-[#265bff]" : "w-1.5 bg-[#dce5f1]"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next market"
            onClick={() => go(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(24,45,74,0.12)] text-sm text-[#536780]"
          >
            ›
          </button>
        </div>
      ) : null}
    </article>
  );
}
