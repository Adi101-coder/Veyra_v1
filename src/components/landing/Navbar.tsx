"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BrandMark } from "@/components/Logo";
import { PremiumButton } from "@/components/landing/PremiumButton";
import { siteConfig } from "@/lib/site";
import { IconClose, IconDiscord, IconMenu, IconX } from "@/components/landing/icons";

const ease = [0.16, 1, 0.3, 1] as const;

const links = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "How it works" },
  { href: "/community", label: "Socials" },
] as const;

const social = [
  { href: "/community", label: "X", Icon: IconX },
  { href: "/community", label: "Discord", Icon: IconDiscord },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/docs") return pathname.startsWith("/docs");
  if (href === "/community") {
    return pathname.startsWith("/community") || pathname.startsWith("/social");
  }
  return pathname === href;
}

export function Navbar() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const mobile = openForPath === pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  return (
    <header
      className={`nova-navbar-glass sticky top-0 z-50 h-[72px] border-b border-white/10 transition-[background-color] duration-500 ${
        scrolled ? "nova-navbar-glass-scrolled border-white/12" : ""
      }`}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5 text-[#f5f5f5] no-underline">
          <BrandMark className="h-7 w-7" />
          <span className="text-[15px] font-medium tracking-[-0.02em]">{siteConfig.name}</span>
        </Link>

        <nav className="hidden items-center gap-9 text-[14px] font-medium text-[#b8b8b8] lg:flex">
          {links.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative tracking-[-0.01em] no-underline transition-colors duration-200 hover:text-white ${
                  active ? "text-white" : ""
                }`}
              >
                {item.label}
                {active ? (
                  <motion.span
                    layoutId="nav-underline"
                    aria-hidden
                    className="absolute -bottom-2 left-1/2 h-px w-3.5 -translate-x-1/2 rounded-full bg-[#c5c8ce]"
                    transition={{ duration: 0.35, ease }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {social.map((item) => (
            <motion.div key={item.label} tabIndex={-1} whileHover={reduce ? undefined : { y: -2 }}>
              <Link
                href={item.href}
                aria-label={item.label}
                className="block text-[#8a8a8a] transition-colors hover:text-white"
              >
                <item.Icon className="h-4 w-4" />
              </Link>
            </motion.div>
          ))}
          <PremiumButton href="/markets" variant="dark" size="sm">
            Launch app
          </PremiumButton>
        </div>

        <button
          type="button"
          className="text-[#f5f5f5] lg:hidden"
          aria-label="Open menu"
          onClick={() => setOpenForPath(pathname)}
        >
          <IconMenu className="h-6 w-6" />
        </button>
      </div>

      <AnimatePresence>
        {mobile ? (
          <motion.div
            className="fixed inset-0 z-[60] bg-[#050505] lg:hidden"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease }}
          >
            <div className="flex h-[72px] items-center justify-between px-5">
              <span className="text-[15px] font-medium">{siteConfig.name}</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpenForPath(null)}>
                <IconClose className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex flex-col gap-2 px-6 pt-8 text-[22px] font-light">
              {links.map((item, index) => (
                <motion.div
                  key={item.href + item.label}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.04 * index, ease }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpenForPath(null)}
                    className={`block border-b border-white/5 py-4 no-underline ${
                      isActive(pathname, item.href) ? "text-white" : "text-[#cfcfcf]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.32, ease }}
                className="mt-8"
              >
                <PremiumButton href="/markets" className="w-full" variant="dark">
                  Launch app
                </PremiumButton>
              </motion.div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
