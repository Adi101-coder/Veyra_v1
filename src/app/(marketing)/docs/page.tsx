import type { Metadata } from "next";
import { Suspense } from "react";
import { DocsView } from "@/components/docs/DocsView";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Explore the protocol, trading infrastructure, APIs, and tools powering Split.",
};

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] bg-[#f8fbff]" />}>
      <DocsView />
    </Suspense>
  );
}
