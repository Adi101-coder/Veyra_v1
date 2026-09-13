import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function NotFound() {
  return (
    <Shell className="py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#7b7b7b]">
        404
      </p>
      <h1 className="mt-3 font-serif text-4xl font-light tracking-[0.04em] text-[#222]">
        Page not found
      </h1>
      <p className="mt-4 max-w-md text-[#656565]">
        That berth is empty. Head back to the landing.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block text-sm font-medium text-[#222] underline-offset-4 hover:underline"
      >
        Back aboard
      </Link>
    </Shell>
  );
}
