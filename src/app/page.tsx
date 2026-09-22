import type { Metadata } from "next";
import { SplitLanding } from "@/components/landing/SplitLanding";

export const metadata: Metadata = {
  title: "Split — Trade the future, Split with conviction.",
  description:
    "Express your confidence in outcomes as percentages. Explore probability-based orders, Kelly sizing, confirmed fills, and reputation built on forecast accuracy.",
};

export default function Home() {
  return <SplitLanding />;
}
