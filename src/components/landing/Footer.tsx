"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { SplitWordmark } from "@/components/Logo";
import { siteConfig } from "@/lib/site";

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
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/#insights", label: "About" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="px-4 pb-8 sm:px-6 lg:px-10">
      <Reveal className="landing-card mx-auto max-w-[1280px] rounded-[28px] border border-[#dce5f1] bg-[#ffffff] px-6 py-12 sm:px-10">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center text-[#182d4a] no-underline" aria-label="Split home">
              <SplitWordmark className="w-[140px]" />
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
        </div>
      </Reveal>
    </footer>
  );
}
