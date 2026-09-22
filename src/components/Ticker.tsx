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
    <div className="bg-[#102951] text-[#d5e4ff]">
      <Shell className="flex h-9 items-center gap-3 overflow-hidden font-mono text-[10px] uppercase tracking-[0.12em] sm:text-[10.5px]">
        <span className="shrink-0 text-[#9fc3ff]">SPLIT</span>
        <span className="hidden shrink-0 opacity-40 sm:inline">·</span>
        <span className="hidden min-w-0 truncate sm:inline">{mastheadDate(now)}</span>
        <div className="ml-auto hidden min-w-0 items-center gap-1.5 md:flex">
          <motion.span
            aria-hidden
            animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9fc3ff] shadow-[0_0_0_2px_rgba(159,195,255,0.28)]"
          />
          <span className="truncate">{headline}</span>
        </div>
      </Shell>
    </div>
  );
}
