import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Ticker } from "@/components/Ticker";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Ticker />
      <DashboardHeader />
      <main className="flex-1">{children}</main>
    </>
  );
}
