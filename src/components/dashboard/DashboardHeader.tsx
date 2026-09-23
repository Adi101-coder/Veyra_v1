"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconX } from "@/components/icons";
import { SplitWordmark } from "@/components/Logo";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/markets", label: "Markets" },
  { href: "/positions", label: "Positions" },
  { href: "/vote", label: "Vote" },
  { href: "/activity", label: "Activity" },
  { href: "/balances", label: "Balances" },
  { href: "/reputation", label: "Reputation" },
  { href: "/write", label: "Write" },
] as const;

function NavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard" || pathname.startsWith("/contract/")
            : pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative shrink-0 py-1 font-serif text-[12px] font-semibold uppercase tracking-[0.08em] no-underline sm:text-[13px] sm:tracking-[0.14em] ${
              active ? "text-[#265bff]" : "text-black"
            }`}
          >
            {link.label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-px bg-[#265bff]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardHeader() {
  return (
    <header className="bg-[#f8fbff]">
      <Shell className="flex items-center justify-between gap-3 pt-4 pb-2 sm:pt-5">
        <Link href="/" className="shrink-0 text-[#182d4a] no-underline" aria-label="Split home">
          <SplitWordmark className="w-[108px] sm:w-[140px]" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href={siteConfig.x.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-[#65758b] no-underline hover:text-[#182d4a] sm:text-[13px]"
            aria-label={`Split on X, ${siteConfig.x.handle}`}
          >
            <IconX className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{siteConfig.x.handle}</span>
          </a>
          <ConnectWalletButton />
        </div>
      </Shell>
      <Shell className="pb-3">
        <NavLinks className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 sm:gap-x-6" />
      </Shell>
    </header>
  );
}
