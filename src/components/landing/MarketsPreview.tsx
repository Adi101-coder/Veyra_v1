"use client";

import Image from "next/image";
import Link from "next/link";
import { Item, Stagger } from "@/components/motion";
import { IconArrowRight } from "@/components/landing/icons";

const plates = [
  {
    src: "/images/rule-market.png",
    alt: "An open market ledger",
    title: "Open a question",
    body: "Sports, finance, science, weather — any future event can be a market.",
  },
  {
    src: "/images/rule-position.png",
    alt: "A stake being placed",
    title: "Take a seat",
    body: "Buy YES or NO. Size the position to how sure you are.",
  },
  {
    src: "/images/rule-discovery.png",
    alt: "Odds moving with the crowd",
    title: "Watch the odds",
    body: "Every trade moves the price. The book is the live signal.",
  },
  {
    src: "/images/rule-settle.png",
    alt: "Settlement and rewards",
    title: "Settle on-chain",
    body: "When the outcome is known, winners are paid automatically.",
  },
];

export function MarketsPreview() {
  return (
    <section id="markets" className="relative z-10 scroll-mt-24 px-4 pb-8 sm:px-6 lg:px-10">
      <Stagger className="landing-card mx-auto max-w-[1280px] rounded-[28px] border border-[#121417] bg-[#0b0c0e]/92 px-5 py-8 backdrop-blur-md sm:px-8 sm:py-12">
        <div className="mb-10 flex items-end justify-between gap-4">
          <Item>
            <h2 className="text-[28px] font-light tracking-[-0.03em] text-white sm:text-[32px]">
              Markets
            </h2>
            <p className="mt-2 max-w-[36ch] text-[14px] leading-6 text-[#8f939c]">
              Not a feed of tickers. A floor of questions about what happens next.
            </p>
          </Item>
          <Item className="hidden sm:block">
            <Link
              href="/markets"
              className="inline-flex items-center gap-1 text-[14px] text-[#b8bcc4] no-underline hover:text-white"
            >
              Enter the floor
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Item>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {plates.map((plate) => (
            <Item key={plate.title}>
              <Link href="/markets" className="group block no-underline">
                <div className="flex h-[200px] items-center justify-center">
                  <Image
                    src={plate.src}
                    alt={plate.alt}
                    width={280}
                    height={280}
                    unoptimized
                    className="h-[180px] w-auto object-contain invert"
                  />
                </div>
                <h3 className="mt-4 text-[16px] font-medium tracking-[-0.02em] text-white group-hover:text-[#e8eaee]">
                  {plate.title}
                </h3>
                <p className="mt-1 text-[13px] leading-5 text-[#8f939c]">{plate.body}</p>
              </Link>
            </Item>
          ))}
        </div>
      </Stagger>
    </section>
  );
}
