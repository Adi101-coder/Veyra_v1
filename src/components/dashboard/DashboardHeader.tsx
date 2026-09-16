"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/Logo";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { Shell } from "@/components/Shell";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/markets", label: "Markets" },
  { href: "/activity", label: "Activity" },
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
            className={`relative pb-1 font-serif text-[12px] uppercase tracking-[0.16em] no-underline sm:text-[13px] ${
              active ? "text-[#1a1a1a]" : "text-[#8a8a8a] hover:text-[#1a1a1a]"
            }`}
          >
            {link.label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-px bg-[#1a1a1a]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardHeader() {
  return (
    <header className="bg-[#f4f2ed]">
      <Shell className="flex items-center justify-between gap-4 pt-5 pb-4">
        <div className="flex min-w-0 items-baseline gap-8 sm:gap-10 lg:gap-12">
          <Link
            href="/"
            className="text-[#1a1a1a] no-underline"
            aria-label="VEYRA home"
          >
            <BrandWordmark className="text-[28px] leading-none sm:text-[32px]" />
          </Link>
          <NavLinks className="hidden items-center gap-7 lg:flex" />
        </div>
        <ConnectWalletButton />
      </Shell>
      <Shell className="flex items-center gap-6 pb-3 lg:hidden">
        <NavLinks className="flex items-center gap-5" />
      </Shell>
    </header>
  );
}
