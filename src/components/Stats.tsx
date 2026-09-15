"use client";

import { Item, Stagger } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function Stats() {
  return (
    <section id="stats" className="scroll-mt-[120px] pt-4 pb-2">
      <Shell>
        <Stagger className="grid grid-cols-2 lg:grid-cols-4">
          {siteConfig.stats.map((stat, index) => (
            <Item
              key={stat.label}
              className="relative flex flex-col items-center justify-center px-3 py-5 text-center sm:px-6 sm:py-8"
            >
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-8 -translate-y-1/2 border-l border-[rgba(26,26,26,0.14)] sm:h-10 lg:h-[52px]"
              />
              {index === siteConfig.stats.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-1/2 right-0 h-8 -translate-y-1/2 border-r border-[rgba(26,26,26,0.14)] sm:h-10 lg:h-[52px]"
                />
              ) : null}
              <p className="flex items-center justify-center gap-2 font-serif text-[26px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
                {"pulse" in stat && stat.pulse ? (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-brass shadow-[0_0_0_2px_rgba(196,164,106,0.22)]"
                  />
                ) : null}
                {stat.value}
              </p>
              <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[#6e6e6e] sm:text-[10.5px]">
                {stat.label}
              </p>
            </Item>
          ))}
        </Stagger>
      </Shell>
    </section>
  );
}
