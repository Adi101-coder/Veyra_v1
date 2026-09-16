"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Item, Stagger } from "@/components/motion";
import { IconArrowRight } from "@/components/landing/icons";
import { PremiumButton } from "@/components/landing/PremiumButton";
import { coreMarkets, type Market } from "@/lib/markets";
import { siteConfig } from "@/lib/site";

function yesOf(market: Market) {
  return market.seats.find((seat) => seat.side === "lands")?.chance ?? 50;
}

export function Hero() {
  const [live, setLive] = useState<Market[]>(coreMarkets.slice(0, 4));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { markets?: Market[] }) => {
        if (cancelled || !json.markets?.length) return;
        setLive(json.markets.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setLive(coreMarkets.slice(0, 4));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative overflow-hidden px-5 pt-28 pb-20 sm:px-8 sm:pt-36 sm:pb-24 lg:px-12 lg:pt-44">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(90,98,112,0.2),transparent_70%)]" />
      <Stagger className="relative mx-auto max-w-[920px] text-center">
        <Item>
          <p className="text-[11px] font-medium tracking-[0.32em] text-[#8d939c] uppercase">
            On-chain markets
          </p>
        </Item>
        <Item>
          <h1 className="mt-6 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f5_42%,#9aa0a6_100%)] bg-clip-text font-light text-[48px] leading-[1.02] tracking-[-0.045em] text-transparent sm:text-[76px] lg:text-[96px] xl:text-[104px]">
            Trade the future,
            <br />
            before it happens.
          </h1>
        </Item>
        <Item>
          <p className="mx-auto mt-7 max-w-[34rem] text-[16px] leading-7 text-[#9a9ea8] sm:text-[18px]">
            Trade real-world outcomes on-chain. Discover markets, take positions, and settle
            transparently.
          </p>
        </Item>
        <Item>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PremiumButton href="/markets" className="w-full sm:w-auto">
              Explore markets
              <IconArrowRight className="h-4 w-4" />
            </PremiumButton>
            <PremiumButton href="/#how-it-works" variant="ghost" className="w-full sm:w-auto">
              How it works
            </PremiumButton>
          </div>
        </Item>
      </Stagger>

      <div className="relative mx-auto mt-16 grid max-w-[880px] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
        {siteConfig.stats.map((stat) => (
          <div key={stat.label} className="bg-[#0b0c0e] px-4 py-5 text-center">
            <p className="text-[22px] font-light tracking-[-0.04em] text-white sm:text-[26px]">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] tracking-[0.14em] text-[#7d818a] uppercase">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="relative mx-auto mt-6 grid max-w-[880px] gap-2 sm:grid-cols-2">
        {live.map((market) => {
          const yes = yesOf(market);
          return (
            <Link
              key={market.id}
              href={`/contract/${market.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b0c0e]/80 px-4 py-3.5 no-underline transition hover:border-white/20"
            >
              <p className="min-w-0 truncate text-[14px] text-[#e8eaee]">{market.title}</p>
              <p className="shrink-0 text-[14px] font-medium tabular-nums text-[#cfd3d8]">{yes}%</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
