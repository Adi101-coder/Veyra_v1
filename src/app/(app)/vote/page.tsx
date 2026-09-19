import type { Metadata } from "next";
import { VotingView } from "@/components/voting/VotingView";

export const metadata: Metadata = {
  title: "Daily vote",
};

export default function VotePage() {
  return <VotingView />;
}
