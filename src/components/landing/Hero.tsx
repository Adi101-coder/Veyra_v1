"use client";

import { Item, Reveal, Stagger } from "@/components/motion";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { IconArrowRight } from "@/components/landing/icons";
import { PremiumButton } from "@/components/landing/PremiumButton";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-28 sm:px-8 sm:pt-36 lg:px-12 lg:pt-44">
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
            <PremiumButton href="/dashboard" className="w-full sm:w-auto">
              Explore markets
              <IconArrowRight className="h-4 w-4" />
            </PremiumButton>
            <PremiumButton href="/#how-it-works" variant="ghost" className="w-full sm:w-auto">
              How it works
            </PremiumButton>
          </div>
        </Item>
      </Stagger>
      <Reveal delay={0.18}>
        <HeroVisual />
      </Reveal>
    </section>
  );
}
