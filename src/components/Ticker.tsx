"use client";

import { useEffect, useState } from "react";
import { motion } from "@/components/motion";
import { mastheadDate } from "@/lib/site";
import { Shell } from "@/components/Shell";
import { getLiveTrades } from "@/lib/betting-api";
import type { LiveTrade } from "@/lib/polymarket";

export function Ticker() {
  const now = new Date();
  const [trades, setTrades] = useState<LiveTrade[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLiveTrades({ limit: 8 })
        .then((json) => {
          if (!cancelled) setTrades(json.trades);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const headline = trades[0]
    ? `${trades[0].title} · ${trades[0].invested} · ${trades[0].ago}`
    : "Live markets";

  return (
    <div className="bg-[#111111] text-[#d8d1b8]">
      <Shell className="flex items-center justify-between gap-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] sm:text-[10.5px]">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <span className="whitespace-nowrap text-brass">VEYRA</span>
          <span className="hidden opacity-40 sm:inline">·</span>
          <span className="min-w-0 truncate">{mastheadDate(now)}</span>
        </div>
        <div className="hidden min-w-0 items-center gap-[18px] sm:flex">
          <div className="flex min-w-0 items-center gap-1.5">
            <motion.span
              aria-hidden
              animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4a46a] shadow-[0_0_0_2px_rgba(196,164,106,0.22)]"
            />
            <span className="max-w-[36rem] truncate">{headline}</span>
          </div>
        </div>
      </Shell>
    </div>
  );
}
