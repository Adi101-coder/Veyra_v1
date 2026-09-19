import type { Metadata } from "next";
import { TreasuryView } from "@/components/treasury/TreasuryView";

export const metadata: Metadata = {
  title: "Balances",
};

export default function BalancesPage() {
  return <TreasuryView />;
}
