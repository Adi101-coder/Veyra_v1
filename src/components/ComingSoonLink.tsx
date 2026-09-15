"use client";

import Link from "next/link";
import { useState } from "react";

type ComingSoonLinkProps = {
  label: string;
  href: string;
  external?: boolean;
};

export function ComingSoonLink({ label, href, external }: ComingSoonLinkProps) {
  const [hovered, setHovered] = useState(false);
  const isComingSoon = href.startsWith("#") && href !== "#faq";

  const className =
    "inline-block py-1 font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-[#7b7b7b] no-underline transition duration-160 sm:text-[11px]";
  const hoverClass = "hover:translate-x-0.5 hover:text-accent";

  if (isComingSoon) {
    return (
      <span
        className={`${className} cursor-default`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hovered ? "Coming Soon" : label}
      </span>
    );
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} ${hoverClass}`}
      >
        {label}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={`${className} ${hoverClass}`}
    >
      {label}
    </Link>
  );
}
