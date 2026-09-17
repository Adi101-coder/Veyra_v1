import type { Metadata } from "next";
import { ReputationView } from "@/components/reputation/ReputationView";

export const metadata: Metadata = {
  title: "Reputation",
};

export default function ReputationPage() {
  return <ReputationView />;
}
