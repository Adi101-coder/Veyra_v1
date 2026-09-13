import Image from "next/image";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function Hero() {
  return (
    <section>
      <Shell>
        <div className="hidden flex-col items-center justify-center pt-[1.2rem] pb-8 text-center lg:flex lg:pb-12">
          <p className="py-4 text-[10px] font-normal uppercase tracking-wider text-[#7b7b7b] opacity-70">
            Last update 0 mins ago
          </p>
          <p className="text-base font-medium tracking-[-0.03em] text-[#656565]">
            {siteConfig.contractCount} Contracts Currently Under Management
          </p>
        </div>

        <div className="flex flex-col justify-between gap-5 py-4 sm:flex-row sm:items-end sm:gap-8 sm:py-6">
          <h1 className="max-w-[36rem] text-[24px] leading-[1.05] tracking-[-0.03em] sm:text-[28px] lg:text-[32px]">
            <span className="font-medium text-[#656565]">Welcome aboard,</span>
            <br />
            <span className="font-normal tracking-[-0.005em] text-[#222]">
              to the Solana-native prediction protocol.
            </span>
          </h1>
          <p className="max-w-[280px] text-left text-sm leading-[1.15] text-[#7b7b7b] sm:text-right sm:text-base sm:leading-[1.45]">
            A composable, on-chain truth machine, where honesty is the only
            winning strategy. Decentralized, permissionless, and liquid.
          </p>
        </div>

        <div className="py-2 sm:py-4">
          <div className="overflow-hidden rounded-[10px] sm:rounded-2xl">
            <Image
              src="/images/hero-virginia.png"
              alt="Halftone riverboat on the water"
              width={1920}
              height={720}
              priority
              className="block h-auto w-full object-contain"
            />
          </div>
        </div>
      </Shell>
    </section>
  );
}
