import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WagerView } from "@/components/dashboard/WagerView";
import { getWager, marketWagers, markets } from "@/lib/markets";

type WagerPageProps = {
  params: Promise<{ id: string; wagerId: string }>;
};

export async function generateStaticParams() {
  return markets.flatMap((market) =>
    marketWagers(market).map((wager) => ({
      id: market.id,
      wagerId: wager.id,
    })),
  );
}

export async function generateMetadata({
  params,
}: WagerPageProps): Promise<Metadata> {
  const { id, wagerId } = await params;
  const found = getWager(id, wagerId);
  return { title: found ? `Wager · ${found.market.title}` : "Wager" };
}

export default async function WagerPage({ params }: WagerPageProps) {
  const { id, wagerId } = await params;
  const found = getWager(id, wagerId);
  if (!found) notFound();
  return <WagerView market={found.market} wager={found.wager} />;
}
