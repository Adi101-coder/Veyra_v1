"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLockup } from "@/components/Logo";
import { Shell } from "@/components/Shell";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/write", label: "Write" },
  { href: "/#how-it-works", label: "How it works" },
] as const;

export function DashboardHeader() {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string | null>(null);

  return (
    <header className="bg-[#f3f1ec]">
      <Shell className="grid grid-cols-2 items-center gap-x-4 pt-4 pb-3 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="text-[#1a1a1a] no-underline"
          aria-label="Vantage home"
        >
          <BrandLockup
            wordmarkClassName="font-serif text-[22px] font-normal tracking-[-0.03em] lowercase sm:text-[26px]"
          />
        </Link>

        <nav className="hidden items-center justify-self-center gap-8 lg:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative pb-1 font-mono text-[11px] uppercase tracking-[0.18em] no-underline ${
                  active ? "text-[#1a1a1a]" : "text-[#7a7a7a] hover:text-[#1a1a1a]"
                }`}
              >
                {link.label}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[#1a1a1a]" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() =>
            setWallet((current) => (current ? null : "4UQy...YVBZ"))
          }
          className="justify-self-end rounded-full border border-[#1a1a1a] px-4 py-1.5 text-[13px] font-medium text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white sm:px-5"
        >
          {wallet ?? "Connect Wallet"}
        </button>
      </Shell>
      <Shell className="flex items-center gap-5 pb-3 lg:hidden">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative pb-1 font-mono text-[11px] uppercase tracking-[0.18em] no-underline ${
                active ? "text-[#1a1a1a]" : "text-[#7a7a7a] hover:text-[#1a1a1a]"
              }`}
            >
              {link.label}
              {active ? (
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[#1a1a1a]" />
              ) : null}
            </Link>
          );
        })}
      </Shell>
    </header>
  );
}
