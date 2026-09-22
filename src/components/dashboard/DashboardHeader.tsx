"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/Logo";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Shell } from "@/components/Shell";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/markets", label: "Markets" },
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
            className={`relative shrink-0 pb-1 font-serif text-[12px] uppercase tracking-[0.12em] no-underline sm:text-[13px] sm:tracking-[0.16em] ${
              active ? "text-[#265bff]" : "text-[#65758b] hover:text-[#182d4a]"
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
      <Shell className="flex items-center justify-between gap-3 pt-4 pb-3 sm:gap-4 sm:pt-5 sm:pb-4">
        <div className="flex min-w-0 items-baseline gap-8 sm:gap-10 lg:gap-12">
          <Link
            href="/"
            className="shrink-0 text-[#182d4a] no-underline"
            aria-label="VEYRA home"
          >
            <BrandWordmark className="text-[24px] leading-none sm:text-[32px]" />
          </Link>
          <NavLinks className="hidden items-center gap-7 lg:flex" />
        </div>
        <ConnectWalletButton />
      </Shell>
      <Shell className="pb-3 lg:hidden">
        <NavLinks className="scroll-x -mx-4 gap-5 px-4 pb-px" />
      </Shell>
    </header>
  );
}
