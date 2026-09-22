import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export default function NotFound() {
  return (
    <Shell className="py-24">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
          404
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light tracking-[-0.02em] text-[#182d4a]">
          {siteConfig.notFound.title}
        </h1>
        <p className="mt-4 max-w-md text-[#536780]">
          {siteConfig.notFound.body}
        </p>
        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {siteConfig.notFound.cta}
        </Link>
      </Reveal>
    </Shell>
  );
}
