"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Stagger } from "@/components/motion";
import { MarketCard } from "@/components/landing/MarketCard";
import { IconArrowRight } from "@/components/landing/icons";
import { coreMarkets } from "@/lib/markets";

export function MarketsPreview() {
  const cards = coreMarkets.slice(0, 6);

  return (
    <section id="markets" className="relative z-10 scroll-mt-24 px-4 pb-8 sm:px-6 lg:px-10">
      <Stagger className="landing-card mx-auto max-w-[1280px] rounded-[28px] border border-[#121417] bg-[#0b0c0e]/92 px-5 py-8 backdrop-blur-md sm:px-8 sm:py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="text-[28px] font-light tracking-[-0.03em] text-white sm:text-[32px]">
            Markets
          </h2>
          <motion.div
            tabIndex={-1}
            whileHover={{ x: 3 }}
            transition={{ duration: 0.2 }}
            className="hidden sm:block"
          >
            <Link
              href="/markets"
              className="inline-flex items-center gap-1 text-[14px] text-[#b8bcc4] no-underline hover:text-white"
            >
              View all
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((market, index) => (
            <MarketCard key={market.id} market={market} index={index} />
          ))}
        </div>
      </Stagger>
    </section>
  );
}
