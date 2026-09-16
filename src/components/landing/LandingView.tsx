import { CTASection } from "@/components/landing/CTASection";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { MarketsPreview } from "@/components/landing/MarketsPreview";
import { TradingPreview } from "@/components/landing/TradingPreview";

export function LandingView() {
  return (
    <>
      <Hero />
      <MarketsPreview />
      <CTASection
        title={"Markets move.\nBe early."}
        body="Access transparent, liquid prediction markets built for the next generation of traders."
        href="/dashboard"
        label="Start trading"
        image="/images/cta-orb.png"
      />
      <FeatureGrid />
      <TradingPreview />
      <HowItWorks />
      <CTASection
        title={"Your view of the future\nis a market."}
        body="Explore live markets and put your conviction on-chain."
        href="/markets"
        label="Explore markets"
        image="/images/final-orb.png"
      />
      <LandingFaq />
    </>
  );
}
