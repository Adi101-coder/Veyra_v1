import { FAQ } from "@/components/FAQ";
import { Hero } from "@/components/Hero";
import { Rules } from "@/components/Rules";
import { Stats } from "@/components/Stats";

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Rules />
      <FAQ />
    </>
  );
}
