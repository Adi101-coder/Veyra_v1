"use client";

import Image from "next/image";
import { Item, Reveal, Stagger, motion } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function Rules() {
  return (
    <section id="how-it-works" className="scroll-mt-[120px] py-10 sm:py-12 lg:py-24">
      <Shell>
        <Reveal>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-accent sm:mb-3 sm:text-[11px]">
            {siteConfig.how.kicker}
          </p>
          <h2 className="mb-3 max-w-[960px] font-serif text-2xl leading-[1.15] tracking-[-0.02em] text-[#1a1a1a] sm:mb-4 sm:text-[32px]">
            {siteConfig.how.title}
          </h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {siteConfig.rules.map((rule) => (
            <Item key={rule.n}>
              <motion.article
                whileHover={{ y: -4 }}
                transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                className="group relative flex h-full flex-col items-center bg-white/80 px-[1.1rem] pt-[1.1rem] pb-5 text-center shadow-[0_6px_18px_-14px_rgba(26,26,26,0.14)] sm:px-5 sm:pt-5"
                style={{ border: "1px solid rgba(26, 26, 26, 0.12)" }}
              >
                <span
                  aria-hidden
                  className="absolute top-0 right-[12%] left-[12%] h-0.5 origin-center scale-x-0 bg-brass opacity-0 transition duration-500 group-hover:scale-x-100 group-hover:opacity-90"
                />
                <div className="mb-2.5 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-[5px] w-[5px] rounded-full bg-accent opacity-90"
                  />
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-[#6e6e6e] sm:text-[10.5px]">
                    {siteConfig.how.itemLabel} {rule.n}
                  </p>
                </div>
                <div className="relative mb-3 flex h-20 w-full items-center justify-center sm:mb-3.5 sm:h-[92px] lg:h-[104px]">
                  <Image
                    src={rule.icon}
                    alt={rule.alt}
                    width={160}
                    height={120}
                    className="relative max-h-full w-auto bg-white object-contain"
                  />
                </div>
                <h3 className="text-[15px] font-medium tracking-[-0.03em] text-[#1a1a1a] sm:text-base">
                  {rule.title}
                </h3>
                <p className="mt-3 text-[13px] leading-[1.45] font-light text-[#6e6e6e]">
                  {rule.body}
                </p>
              </motion.article>
            </Item>
          ))}
        </Stagger>
      </Shell>
    </section>
  );
}
