"use client";

import Link from "next/link";
import { BrandLockup } from "@/components/Logo";
import { motion } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header>
      <Shell className="grid grid-cols-2 items-center gap-x-6 gap-y-2.5 pt-[19px] pb-3.5 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="text-[#1a1a1a] no-underline"
          aria-label={siteConfig.name}
        >
          <BrandLockup />
        </Link>

        <nav className="flex items-center justify-self-end gap-4 sm:gap-6 lg:justify-self-center lg:gap-16">
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

        <motion.div
          whileHover={{ y: -1, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="hidden justify-self-end lg:block"
        >
          <Link
            href={siteConfig.ctaHref}
            aria-label={siteConfig.cta}
            className="launch-sheen relative isolate inline-flex items-center overflow-hidden rounded-full bg-[#1a1a1a] px-8 py-2 text-[15px] font-medium whitespace-nowrap text-white no-underline"
          >
            <span className="relative z-1">{siteConfig.cta}</span>
          </Link>
        </motion.div>
      </Shell>
    </header>
  );
}
