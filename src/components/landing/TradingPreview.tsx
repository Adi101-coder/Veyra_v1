"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion";
import { PremiumButton } from "@/components/landing/PremiumButton";
import { getMarket, type Market } from "@/lib/markets";

const RANGES = ["1H", "1D", "1W", "1M"] as const;

function chartPath(range: (typeof RANGES)[number]) {
  const seed = range.charCodeAt(1);
  const values: number[] = [];
  let v = 48 + (seed % 10);
  for (let i = 0; i < 36; i += 1) {
    v = Math.min(92, Math.max(18, v + ((Math.sin(i / 3 + seed) * 8 + ((i * seed) % 7) - 3) | 0)));
    values.push(v);
  }
  return values
    .map((value, index) => {
      const x = (index / 35) * 640;
      const y = 220 - (value / 100) * 180;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TradingPreview() {
  const reduce = useReducedMotion();
  const fallback = getMarket("hype") ?? getMarket("jimothy")!;
  const [market, setMarket] = useState<Market>(fallback);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets?limit=8", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { source?: string; markets?: Market[] } | null) => {
        if (cancelled) return;
        if (json?.source === "polymarket" && json.markets?.[0]) setMarket(json.markets[0]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const yes = market.seats.find((seat) => seat.side === "lands")?.chance ?? market.seats[0]?.chance ?? 64;
  const no = Math.max(1, 100 - yes);
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [amount, setAmount] = useState("250");
  const d = useMemo(() => chartPath(range), [range]);

  return (
    <section className="px-4 py-8 sm:px-6 lg:px-10">
      <Reveal className="landing-card mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] border border-[#121417] bg-[#0b0c0e] lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]">
        <div className="border-b border-[#121417] p-6 sm:p-8 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-medium tracking-[-0.03em] text-white sm:text-[26px]">
                {market.title}
              </h2>
              <p className="mt-1 text-[12px] tracking-[0.16em] text-[#7d818a] uppercase">Trading</p>
            </div>
            <p className="text-[40px] font-light tracking-[-0.04em] text-white">{yes}%</p>
          </div>
          <div className="mt-6 flex gap-2">
            {RANGES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`relative rounded-full px-3 py-1 text-[12px] transition ${
                  range === item ? "text-white" : "text-[#7d818a] hover:text-white"
                }`}
              >
                {range === item ? (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-full bg-white/10"
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  />
                ) : null}
                <span className="relative z-10">{item}</span>
              </button>
            ))}
          </div>
          <svg viewBox="0 0 640 240" className="mt-4 h-[220px] w-full" aria-hidden>
            <defs>
              <linearGradient id="trade-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d5d7db" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#d5d7db" stopOpacity="0" />
              </linearGradient>
            </defs>
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={i}
                x1="0"
                x2="640"
                y1={40 + i * 40}
                y2={40 + i * 40}
                stroke="#1a1c20"
                strokeWidth="1"
              />
            ))}
            <motion.path
              key={`${range}-fill`}
              d={`${d} L640 220 L0 220 Z`}
              fill="url(#trade-fill)"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.path
              key={range}
              d={d}
              fill="none"
              stroke="#d5d7db"
              strokeWidth="1.6"
              initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#121417] bg-white/5 p-4">
              <p className="text-[11px] tracking-[0.16em] text-[#8a8e96] uppercase">Yes</p>
              <p className="mt-2 text-[28px] font-light text-white">{yes}¢</p>
            </div>
            <div className="rounded-2xl border border-[#121417] bg-white/5 p-4">
              <p className="text-[11px] tracking-[0.16em] text-[#8a8e96] uppercase">No</p>
              <p className="mt-2 text-[28px] font-light text-[#b0b4bc]">{no}¢</p>
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] tracking-[0.16em] text-[#8a8e96] uppercase">Amount</span>
            <span className="relative mt-2 block">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#8a8e96]">
                $
              </span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                className="w-full rounded-2xl border border-[#121417] bg-[#08090b] py-3 pr-4 pl-8 text-[18px] text-white outline-none transition focus:border-white/25"
              />
            </span>
          </label>
          <PremiumButton href={`/contract/${market.id}`} className="w-full">
            Buy YES
          </PremiumButton>
        </div>
      </Reveal>
    </section>
  );
}
