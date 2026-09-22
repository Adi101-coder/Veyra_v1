import { siteConfig } from "@/lib/site";

type SplitWordmarkProps = {
  className?: string;
};

/** The landing-page Split wordmark, cropped the same way as the homepage brand. */
export function SplitWordmark({ className = "w-[140px] sm:w-[160px]" }: SplitWordmarkProps) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-[5px] bg-[#265bff] leading-none ${className}`.trim()}
      style={{ aspectRatio: "3.2" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/split-assets/split-logo.png"
        alt={siteConfig.name}
        width={2172}
        height={724}
        className="absolute top-1/2 left-1/2 block h-auto w-[176%] max-w-none -translate-x-[49.24%] -translate-y-[51.17%]"
      />
    </span>
  );
}

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-9 w-9" }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="11" fill="#265bff" />
      <path
        d="M11 24h9m16-12L17 24l19 12"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return <SplitWordmark className={className || "w-[140px] sm:w-[160px]"} />;
}

type BrandLockupProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
};

export function BrandLockup({ className = "" }: BrandLockupProps) {
  return (
    <span className={`inline-flex items-center text-inherit ${className}`.trim()}>
      <SplitWordmark />
    </span>
  );
}
