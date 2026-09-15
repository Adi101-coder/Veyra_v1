import { siteConfig } from "@/lib/site";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-9 w-9" }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      fill="none"
    >
      <path
        d="M8 38 L24 8 L40 38"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path
        d="M16.5 28 H31.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
      <circle cx="24" cy="8" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-serif font-normal lowercase tracking-[-0.03em] ${className}`.trim()}
    >
      {siteConfig.name}
    </span>
  );
}

type BrandLockupProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
};

export function BrandLockup({
  className = "",
  markClassName,
  wordmarkClassName,
}: BrandLockupProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-inherit ${className}`.trim()}>
      <BrandMark className={markClassName ?? "h-8 w-8 sm:h-9 sm:w-9"} />
      <span
        className={
          wordmarkClassName ??
          "font-sans text-[15px] font-semibold tracking-[0.22em] sm:text-[17px]"
        }
      >
        {siteConfig.wordmark}
      </span>
    </span>
  );
}
