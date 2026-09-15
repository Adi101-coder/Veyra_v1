import type { Metadata } from "next";
import { WriteView } from "@/components/dashboard/WriteView";

export const metadata: Metadata = {
  title: "Write",
};

export default function WritePage() {
  return <WriteView />;
}
