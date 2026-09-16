"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1] as const;

type PremiumButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "light" | "dark" | "ghost";
  size?: "md" | "sm";
  className?: string;
};

export function PremiumButton({
  href,
  children,
  variant = "light",
  size = "md",
  className = "",
}: PremiumButtonProps) {
  const reduce = useReducedMotion();
  const look =
    variant === "light"
      ? "bg-[linear-gradient(180deg,#f7f7f7,#c8ccd2)] text-[#111] shadow-[0_10px_30px_-18px_rgba(255,255,255,0.45)]"
      : variant === "dark"
        ? "border border-white/10 bg-[linear-gradient(180deg,#2a2c31,#16171b)] text-white"
        : "border border-white/15 bg-transparent text-white";
  const dims = size === "sm" ? "h-9 px-4 text-[13px]" : "h-12 px-7 text-[15px]";

  return (
    <motion.div
      tabIndex={-1}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.2, ease }}
      className={`inline-flex ${className}`}
    >
      <Link
        href={href}
        className={`premium-sheen relative isolate inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full font-medium no-underline ${dims} ${look}`}
      >
        {children}
      </Link>
    </motion.div>
  );
}
