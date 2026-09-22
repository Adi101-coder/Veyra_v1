"use client";

import Image from "next/image";
import { Reveal, motion } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function Hero() {
  const { hero } = siteConfig;

  return (
    <section>
      <Shell>
        <Reveal className="flex flex-col items-center justify-center pt-6 pb-2 text-center sm:pt-8 lg:pt-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
            {hero.kicker}
          </p>
          <p className="mt-3 text-sm font-medium tracking-[-0.03em] text-[#536780] sm:text-base">
            {hero.status}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-10 pt-10 pb-4 sm:gap-12 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-x-20 lg:pt-16">
          <Reveal className="max-w-[40rem]">
            <h1 className="font-serif text-[32px] leading-[1.12] tracking-[-0.02em] text-[#182d4a] sm:text-[40px] lg:text-[48px]">
              {hero.headline}
            </h1>
            <p className="mt-5 max-w-[34rem] font-sans text-[17px] leading-[1.45] font-medium tracking-[-0.02em] text-[#536780] sm:mt-6 sm:text-[19px] sm:leading-[1.4]">
              {hero.subhead}
            </p>
            <p className="mt-8 max-w-[36rem] text-[15px] leading-[1.75] text-[#65758b] sm:mt-10 sm:text-base">
              {hero.body}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-[280px] text-sm leading-[1.7] text-[#65758b] lg:ml-auto lg:max-w-none lg:pt-2 lg:text-right">
              {hero.lede}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12} className="pt-8 pb-2 sm:pt-12 sm:pb-4">
          <motion.div
            className="relative aspect-[21/8] w-full overflow-hidden rounded-[10px] bg-[#f8fbff] sm:rounded-2xl"
            initial={{ scale: 1.03 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <Image
              src="/images/hero-vantage-dither.png"
              alt="A vantage terrace overlooking the landscape"
              fill
              sizes="(min-width: 1024px) 1120px, 100vw"
              priority
              className="object-cover object-center"
            />
          </motion.div>
        </Reveal>
      </Shell>
    </section>
  );
}
