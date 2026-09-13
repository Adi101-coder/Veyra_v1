import { ComingSoonLink } from "@/components/ComingSoonLink";
import {
  IconDiscord,
  IconLink,
  IconTelegram,
  IconX,
} from "@/components/icons";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="pt-6 pb-4 sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8">
      <div className="border-t border-dashed border-[rgba(20,20,20,0.18)]" />
      <Shell className="grid grid-cols-1 gap-8 pt-8 pb-6 sm:grid-cols-2 sm:gap-10 sm:pt-10 sm:pb-8 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:gap-12 lg:pt-12 lg:pb-10">
        <div className="flex flex-col items-start gap-3.5 sm:gap-[18px]">
          <p className="font-serif text-[22px] leading-none tracking-[0.01em] text-[#656565] sm:text-2xl lg:text-[26px]">
            {siteConfig.name}
          </p>
          <div className="relative -left-2.5 flex items-center gap-2.5">
            <a
              href={siteConfig.social.discord}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="inline-flex h-10 w-10 items-center justify-center text-[#656565] transition duration-180 hover:-translate-y-px hover:text-[#141414]"
            >
              <IconDiscord className="h-6 w-6" />
            </a>
            <a
              href={siteConfig.social.twitter}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter / X"
              className="inline-flex h-10 w-10 items-center justify-center text-[#656565] transition duration-180 hover:-translate-y-px hover:text-[#141414]"
            >
              <IconX className="h-6 w-6" />
            </a>
            <a
              href={siteConfig.social.telegram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="inline-flex h-10 w-10 items-center justify-center text-[#656565] transition duration-180 hover:-translate-y-px hover:text-[#141414]"
            >
              <IconTelegram className="h-6 w-6" />
            </a>
            <a
              href={siteConfig.social.pumpfun}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pump.fun token"
              className="inline-flex h-10 w-10 items-center justify-center text-[#656565] transition duration-180 hover:-translate-y-px hover:text-[#141414]"
            >
              <IconLink className="h-6 w-6" />
            </a>
          </div>
        </div>

        {siteConfig.footer.map((column) => (
          <div key={column.heading} className="text-left">
            <p className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#222] sm:mb-[18px] sm:text-[11px]">
              {`${column.heading}`}
            </p>
            <div className="flex flex-col items-start gap-0.5">
              {column.links.map((link) => (
                <ComingSoonLink
                  key={link.label}
                  label={link.label}
                  href={link.href}
                  external={"external" in link ? link.external : false}
                />
              ))}
            </div>
          </div>
        ))}
      </Shell>
    </footer>
  );
}
