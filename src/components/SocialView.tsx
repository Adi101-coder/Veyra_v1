"use client";

import { Item, Reveal, Stagger, motion } from "@/components/motion";
import {
  IconChevron,
  IconDiscord,
  IconTelegram,
  IconX,
} from "@/components/icons";
import { siteConfig } from "@/lib/site";

const channelIcons = {
  X: IconX,
  Discord: IconDiscord,
  Telegram: IconTelegram,
} as const;

export function SocialView() {
  const copy = siteConfig.socialPage;

  return (
    <div className="mx-auto mt-10 w-full max-w-[880px] px-4">
      <Reveal className="mb-8 text-center">
        <p className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#65758b]">
          {copy.kicker}
        </p>
        <h1 className="text-[30px] font-light leading-[1.15] tracking-[-0.03em] text-[#182d4a] sm:text-[38px] lg:text-[44px]">
          {copy.title}
        </h1>
      </Reveal>

      <Reveal delay={0.06} className="mb-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#65758b]">
            {copy.sectionKicker}
          </p>
        </div>
        <h2 className="mb-3 text-[26px] font-light leading-[1.2] tracking-[-0.03em] text-[#182d4a] sm:text-[30px] lg:text-[34px]">
          {copy.sectionTitle}
        </h2>
        <p className="max-w-[640px] text-sm leading-[1.75] text-[#65758b]">
          {copy.sectionBody}
        </p>
      </Reveal>

      <Stagger className="mb-12 flex flex-col gap-3.5">
        {siteConfig.channels.map((channel) => {
          const Icon = channelIcons[channel.label];
          const comingSoon = channel.href.startsWith("#");
          return (
            <Item key={channel.label}>
              <motion.div
                whileHover={{ y: -2, borderColor: "rgb(42, 45, 51)" }}
                className="group flex items-center gap-5 rounded-[20px] border border-[#dce5f1] bg-[#ffffff] p-5 text-inherit sm:p-6"
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 min-w-12 items-center justify-center rounded-full border border-[#dce5f1] bg-[#f1f6ff] text-[#265bff]"
                >
                  <Icon className={channel.label === "X" ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block text-[20px] font-medium tracking-[-0.02em] text-[#182d4a] sm:text-[22px]">
                    {channel.label}
                  </span>
                  <span className="block text-xs text-[#65758b]">
                    {comingSoon ? "Coming soon" : channel.handle}
                  </span>
                </span>
                <IconChevron className="h-[18px] w-[18px] shrink-0 text-[#65758b] opacity-40" />
              </motion.div>
            </Item>
          );
        })}
      </Stagger>

      <Reveal className="mt-4 border-t border-[#dce5f1] pt-8 pb-16">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#65758b]">
          {copy.footnoteKicker}
        </p>
        <p className="max-w-[640px] text-sm leading-[1.75] text-[#65758b]">
          {copy.footnote}
        </p>
      </Reveal>
    </div>
  );
}
