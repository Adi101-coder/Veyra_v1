"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion";
import { BrandMark } from "@/components/Logo";
import { siteConfig } from "@/lib/site";
import { IconDiscord, IconX } from "@/components/landing/icons";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "/markets", label: "Markets" },
      { href: "/dashboard", label: "Trading" },
      { href: "/activity", label: "Portfolio" },
      { href: "/#how-it-works", label: "How it works" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs?page=api-overview", label: "API" },
      { href: "/docs?page=architecture", label: "Architecture" },
      { href: "/community#github", label: "GitHub" },
    ],
  },
  {
    heading: "Community",
    links: [
      { href: "/community#discord", label: "Discord" },
      { href: "/community", label: "X" },
      { href: "/community#telegram", label: "Telegram" },
      { href: "/community#events", label: "Events" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/#insights", label: "About" },
      { href: "/community", label: "Careers" },
      { href: "/community", label: "Contact" },
    ],
  },
];

export function Footer() {
  const reduce = useReducedMotion();

  return (
    <footer className="px-4 pb-8 sm:px-6 lg:px-10">
      <Reveal className="landing-card mx-auto max-w-[1280px] rounded-[28px] border border-[#dce5f1] bg-[#ffffff] px-6 py-12 sm:px-10">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 text-[#182d4a] no-underline">
              <BrandMark className="h-7 w-7" />
              <span className="text-[15px] font-medium">{siteConfig.name}</span>
            </Link>
            <p className="mt-4 max-w-[22ch] text-[14px] leading-6 text-[#65758b]">
              {siteConfig.tagline}
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.heading}>
              <p className="text-[11px] tracking-[0.2em] text-[#657da0] uppercase">{column.heading}</p>
              <ul className="mt-4 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-[#536780] no-underline transition hover:text-[#265bff]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#dce5f1] pt-6 text-[13px] text-[#657da0]">
          <p>© 2026 {siteConfig.name}</p>
          <div className="flex items-center gap-4">
            {[
              { href: "/community", label: "X", Icon: IconX },
              { href: "/community#discord", label: "Discord", Icon: IconDiscord },
            ].map((item) => (
              <motion.div key={item.label} tabIndex={-1} whileHover={reduce ? undefined : { y: -2 }}>
                <Link href={item.href} aria-label={item.label} className="block hover:text-[#265bff]">
                  <item.Icon className="h-4 w-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </Reveal>
    </footer>
  );
}
