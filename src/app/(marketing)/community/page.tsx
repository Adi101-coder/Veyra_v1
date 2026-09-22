import type { Metadata } from "next";
import { CommunityView } from "@/components/community/CommunityView";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Connect with traders, builders, and researchers in the Split community.",
};

export default function CommunityPage() {
  return <CommunityView />;
}
