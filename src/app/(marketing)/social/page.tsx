import type { Metadata } from "next";
import { SocialView } from "@/components/SocialView";

export const metadata: Metadata = {
  title: "Community",
};

export default function SocialPage() {
  return <SocialView />;
}
