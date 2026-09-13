import { Shell } from "@/components/Shell";

const logos = [
  {
    name: "Breakout",
    href: "https://blog.colosseum.com/announcing-the-winners-of-the-solana-breakout-hackathon/",
    src: "/images/breakout.svg",
    width: 238,
    height: 37,
  },
  {
    name: "Helius",
    href: "https://www.helius.dev/",
    src: "/images/helius.svg",
    width: 562,
    height: 118,
  },
  {
    name: "Solana",
    href: "https://solana.com/",
    src: "/images/solana.svg",
    width: 146,
    height: 27,
  },
] as const;

export function Partners() {
  return (
    <section className="pt-4 pb-2">
      <Shell>
        <div className="flex justify-center">
          {logos.map((logo, index) => (
            <div
              key={logo.name}
              className="relative flex h-[60px] w-[158px] items-center justify-center sm:w-[268px] lg:h-[100px]"
            >
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-5 -translate-y-1/2 border-l border-[#ececec] sm:h-[30px] lg:h-[47px]"
              />
              {index === logos.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-1/2 right-0 h-5 -translate-y-1/2 border-r border-[#ececec] sm:h-[30px] lg:h-[47px]"
                />
              ) : null}
              <a
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={logo.name}
                className="inline-flex h-full w-full items-center justify-center opacity-80 transition-opacity duration-180 hover:opacity-100"
              >
                {/* SVGs inherit currentColor poorly through next/image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.src}
                  alt={logo.name}
                  width={logo.width}
                  height={logo.height}
                  className="h-auto max-h-[28px] w-auto max-w-[45%] lg:max-h-[40px]"
                />
              </a>
            </div>
          ))}
        </div>

        <p className="flex flex-wrap items-center justify-center gap-3 pt-2 text-center text-[10px] font-light tracking-[-0.03em] text-[#7b7b7b] sm:text-sm lg:text-base">
          <span>Entirely on Solana</span>
          <span>·</span>
          <span>No market makers</span>
          <span>·</span>
          <span>No gatekeepers</span>
        </p>
      </Shell>
    </section>
  );
}
