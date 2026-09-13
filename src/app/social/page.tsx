import type { Metadata } from "next";
import {
  IconChevron,
  IconDiscord,
  IconTelegram,
  IconX,
} from "@/components/icons";
import { TokenContractCard } from "@/components/TokenContractCard";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Social",
};

const channels = [
  {
    label: "X",
    handle: siteConfig.social.twitterHandle,
    href: siteConfig.social.twitter,
    logoSize: 18,
    Icon: IconX,
  },
  {
    label: "Telegram",
    handle: siteConfig.social.telegramHandle,
    href: siteConfig.social.telegram,
    logoSize: 22,
    Icon: IconTelegram,
  },
  {
    label: "Discord",
    handle: siteConfig.social.discordHandle,
    href: siteConfig.social.discord,
    logoSize: 22,
    Icon: IconDiscord,
  },
] as const;

export default function SocialPage() {
  return (
    <div className="mx-auto mt-10 w-full max-w-[880px] px-4">
      <header className="mb-8 text-center">
        <p className="mb-2.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
          Community
        </p>
        <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[0.01em] text-[#2a2a2a] sm:text-[38px] lg:text-[44px]">
          Where the crew gathers.
        </h1>
      </header>

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[#4a4a4a]"
          />
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
            Channels & Signals
          </p>
        </div>
        <h2 className="mb-3 font-serif text-[26px] font-normal leading-[1.2] tracking-[0.01em] text-[#2a2a2a] sm:text-[30px] lg:text-[34px]">
          Find us on the wire.
        </h2>
        <p className="max-w-[640px] font-mono text-sm leading-[1.75] text-[#4a4a4a]">
          A small but loud crew of writers, wagerers, and resolvers. Find us
          where you find everyone else, and please play nice.
        </p>
      </section>

      <div className="mb-12 flex flex-col gap-3.5">
        {channels.map((channel) => (
          <a
            key={channel.label}
            href={channel.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-5 rounded-[14px] border border-[#cfcfcf] bg-white p-5 text-inherit no-underline transition-all duration-160 hover:border-[#4a4a4a] hover:bg-[#f5f5f5] hover:shadow-[0_8px_22px_rgba(0,0,0,0.08)] sm:p-6"
          >
            <span
              aria-hidden
              className="flex h-12 w-12 min-w-12 items-center justify-center rounded-full border border-[#cfcfcf] bg-[#f5f5f5] text-[#4a4a4a]"
            >
              <channel.Icon
                className={channel.logoSize === 18 ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-1 block font-serif text-[20px] font-normal tracking-[0.01em] text-[#2a2a2a] sm:text-[22px]">
                {channel.label}
              </span>
              <span className="block font-mono text-xs text-[#4a4a4a]">
                {channel.handle}
              </span>
            </span>
            <IconChevron className="h-[18px] w-[18px] shrink-0 text-[#4a4a4a] transition-transform duration-160 group-hover:translate-x-1" />
          </a>
        ))}
        <TokenContractCard />
      </div>

      <section className="mt-4 border-t border-[#cfcfcf] pt-8 pb-16">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
          One more thing
        </p>
        <p className="max-w-[640px] font-mono text-sm leading-[1.75] text-[#4a4a4a]">
          Spotted a contract that bends the rules? Flag it on{" "}
          <a
            href={siteConfig.social.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#4a4a4a] no-underline [border-bottom:1px_solid_#4a4a4a] transition-colors duration-160 hover:border-[#2a2a2a] hover:text-[#2a2a2a]"
          >
            Discord
          </a>{" "}
          or reach out on{" "}
          <a
            href={siteConfig.social.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#4a4a4a] no-underline [border-bottom:1px_solid_#4a4a4a] transition-colors duration-160 hover:border-[#2a2a2a] hover:text-[#2a2a2a]"
          >
            X
          </a>
          .
        </p>
      </section>
    </div>
  );
}
