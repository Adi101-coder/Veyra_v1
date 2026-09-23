import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Ticker } from "@/components/Ticker";
import { AppWalletProvider } from "@/components/wallet/AppWalletProvider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppWalletProvider>
      <Ticker />
      <DashboardHeader />
      <main className="min-w-0 flex-1">{children}</main>
    </AppWalletProvider>
  );
}
