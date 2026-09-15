"use client";

import Link from "next/link";
import { BrandLockup } from "@/components/Logo";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header>
      <Shell className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 pt-[19px] pb-3.5 sm:gap-x-6 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="text-[#1a1a1a] no-underline"
          aria-label={siteConfig.name}
        >
          <BrandLockup />
        </Link>

        <nav className="order-3 col-span-2 flex items-center justify-self-start gap-4 sm:gap-6 lg:order-none lg:col-span-1 lg:justify-self-center lg:gap-16">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs font-medium text-[#6e6e6e] transition duration-160 hover:translate-x-0.5 hover:text-accent sm:text-[15px]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/dashboard"
          aria-label={siteConfig.cta}
          className="launch-sheen relative isolate justify-self-end overflow-hidden rounded-full bg-[#1a1a1a] px-4 py-2 text-[13px] font-medium whitespace-nowrap text-white no-underline transition duration-160 hover:-translate-y-px sm:px-8 sm:text-[15px] lg:inline-flex lg:items-center"
        >
          <span className="relative z-1">{siteConfig.cta}</span>
        </Link>
      </Shell>
    </header>
  );
}
