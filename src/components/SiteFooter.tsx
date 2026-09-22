"use client";

import { ComingSoonLink } from "@/components/ComingSoonLink";
import { BrandLockup } from "@/components/Logo";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="pt-6 pb-4 sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8">
      <div className="border-t border-dashed border-[rgba(24,45,74,0.18)]" />
      <Shell className="grid grid-cols-1 gap-8 pt-8 pb-6 sm:grid-cols-2 sm:gap-10 sm:pt-10 sm:pb-8 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:gap-12 lg:pt-12 lg:pb-10">
        <div className="flex flex-col items-start gap-3.5 sm:gap-[18px]">
          <BrandLockup
            className="text-[#536780]"
            markClassName="h-7 w-7"
            wordmarkClassName="font-sans text-[14px] font-semibold tracking-[0.22em]"
          />
          <p className="max-w-[240px] text-sm leading-6 text-[#65758b]">
            {siteConfig.tagline}
          </p>
        </div>

        {siteConfig.footer.map((column) => (
          <div key={column.heading} className="text-left">
            <p className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.28em] text-accent sm:mb-[18px] sm:text-[11px]">
              {column.heading}
            </p>
            <div className="flex flex-col items-start gap-0.5">
              {column.links.map((link) => (
                <ComingSoonLink
                  key={link.label}
                  label={link.label}
                  href={link.href}
                />
              ))}
            </div>
          </div>
        ))}
      </Shell>
    </footer>
  );
}
