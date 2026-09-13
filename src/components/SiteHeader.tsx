import Link from "next/link";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header>
      <Shell className="grid grid-cols-2 items-center gap-x-6 gap-y-2.5 pt-[19px] pb-3.5 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="font-serif text-[32px] font-extralight leading-none tracking-[0.05rem] text-[#222] no-underline sm:text-[46px] lg:text-[52px]"
        >
          {siteConfig.name}
        </Link>

        <nav className="justify-self-end flex items-center gap-4 sm:gap-6 lg:justify-self-center lg:gap-20">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs font-medium text-[#7b7b7b] transition duration-160 hover:translate-x-0.5 hover:text-[#222] sm:text-base"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href={siteConfig.appUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Launch status: Mainnet Alpha Live!"
          className="launch-sheen relative isolate hidden justify-self-end overflow-hidden rounded-full bg-[#181715] px-14 py-2 text-base font-medium whitespace-nowrap text-white lg:inline-flex lg:items-center"
        >
          <span className="relative z-1">Launch App &gt;</span>
        </a>
      </Shell>
    </header>
  );
}
