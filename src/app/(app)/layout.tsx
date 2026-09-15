import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Ticker } from "@/components/Ticker";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      <Ticker />
      <DashboardHeader />
      <main className="flex-1">{children}</main>
    </WalletProvider>
  );
}
