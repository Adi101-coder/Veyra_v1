import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractView } from "@/components/dashboard/ContractView";
import { getMarket, markets } from "@/lib/markets";

type ContractPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateStaticParams() {
  return markets.map((market) => ({ id: market.id }));
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: ContractPageProps): Promise<Metadata> {
  const { id } = await params;
  const local = getMarket(id);
  if (local) return { title: local.title };
  try {
    const { getPoolMarket } = await import("@/server/voting/pool");
    const pool = await getPoolMarket(id).catch(() => null);
    if (pool) return { title: pool.title };
    const { fetchPolymarketMarket } = await import("@/lib/polymarket");
    const live = await fetchPolymarketMarket(id);
    return { title: live?.title ?? "Contract" };
  } catch {
    return { title: "Contract" };
  }
}

export default async function ContractPage({ params }: ContractPageProps) {
  const { id } = await params;
  const local = getMarket(id);
  if (local) return <ContractView market={local} />;
  // Veyra-native pools created by a voting round are database rows, not catalog
  // entries, so the lookup above misses them.
  const { getPoolMarket } = await import("@/server/voting/pool");
  const pool = await getPoolMarket(id).catch(() => null);
  if (pool) return <ContractView market={pool} />;
  const { fetchPolymarketMarket } = await import("@/lib/polymarket");
  const live = await fetchPolymarketMarket(id);
  if (!live) notFound();
  return <ContractView market={live} />;
}
