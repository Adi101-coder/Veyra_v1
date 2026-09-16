import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WagerView } from "@/components/dashboard/WagerView";
import { predictionToWagerRow } from "@/lib/betting";
import { getMarket, shortenKey } from "@/lib/markets";

type WagerPageProps = {
  params: Promise<{ id: string; wagerId: string }>;
};

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: WagerPageProps): Promise<Metadata> {
  const { wagerId } = await params;
  try {
    const { getPrediction } = await import("@/server/betting/service");
    const prediction = await getPrediction(wagerId);
    return { title: prediction ? `Wager · ${prediction.marketTitle}` : "Wager" };
  } catch {
    return { title: "Wager" };
  }
}

export default async function WagerPage({ params }: WagerPageProps) {
  const { id, wagerId } = await params;
  const { getPrediction } = await import("@/server/betting/service");
  const prediction = await getPrediction(wagerId);
  if (!prediction || prediction.marketId !== id) notFound();

  const local = getMarket(id);
  const market =
    local ?? (await (await import("@/lib/polymarket")).fetchPolymarketMarket(id));
  if (!market) notFound();

  return (
    <WagerView
      market={market}
      wager={predictionToWagerRow(prediction, shortenKey)}
      prediction={prediction}
    />
  );
}
