"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { LiveTrade } from "@/lib/polymarket";
import {
  cardClass,
  Photo,
  RailButtons,
  RailTrack,
  SectionHead,
  useRail,
} from "@/components/markets/primitives";

function TradeFace({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // Remote Polymarket profile photos are optional and hosts vary.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-7 w-7 rounded-full object-cover" />
    );
  }
  const letter = name.slice(0, 1).toUpperCase();
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#171717] text-[11px] font-semibold text-white">
      {letter}
    </span>
  );
}

function MarketIcon({ src, title }: { src: string | null; title: string }) {
  if (src?.startsWith("/")) {
    return <Photo src={src} alt="" className="h-8 w-8 rounded-lg" />;
  }
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-8 w-8 rounded-lg object-cover" />
    );
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#f4f2ec] text-[11px] font-semibold text-[#8b887f]">
      {title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TrendingPositions() {
  const rail = useRail();
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/trades", { cache: "no-store" });
        const json = (await response.json()) as { trades?: LiveTrade[] };
        if (cancelled) return;
        if (json.trades?.length) {
          setTrades(json.trades);
          setStatus("live");
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section>
      <SectionHead
        title="Trending Positions Live"
        extra={
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
                status === "live" ? "text-[#0f854f]" : "text-[#8b887f]"
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
              {status === "live" ? "Live · Polymarket" : status === "loading" ? "Syncing" : "Tape unavailable"}
            </span>
            <RailButtons onPrev={rail.onPrev} onNext={rail.onNext} />
          </div>
        }
      />
      {trades.length === 0 ? (
        <p className={`${cardClass} px-5 py-10 text-center text-[14px] text-[#8b887f]`}>
          {status === "loading" ? "Loading live fills…" : "Could not reach the Polymarket tape right now."}
        </p>
      ) : (
        <RailTrack railRef={rail.ref}>
          {trades.map((row) => (
            <Link
              key={row.id}
              href={`/contract/${row.marketId}`}
              className={`${cardClass} w-[272px] shrink-0 p-4 no-underline`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TradeFace src={row.avatar} name={row.trader} />
                  <span className="truncate text-[13px] font-medium text-[#171717]">{row.trader}</span>
                </span>
                <span className="shrink-0 text-[12px] text-[#8b887f]">{row.ago}</span>
              </div>
              <p className="mt-3.5 text-[14px] leading-6 text-[#171717]">
                <span className="font-semibold tabular-nums">{row.invested} invested</span>
                <span className="text-[#8b887f]">, </span>
                <span className="font-semibold tabular-nums text-[#0f854f]">
                  {row.payout} potential payout
                </span>
              </p>
              <div className="mt-4 flex items-center gap-2.5">
                <MarketIcon src={row.icon} title={row.title} />
                <p className="min-w-0 truncate text-[13px] font-medium text-[#171717]">{row.title}</p>
              </div>
              <p className={`mt-2 text-[13px] font-medium ${row.up ? "text-[#0f854f]" : "text-[#c45c6a]"}`}>
                {row.side}
              </p>
            </Link>
          ))}
        </RailTrack>
      )}
    </section>
  );
}
