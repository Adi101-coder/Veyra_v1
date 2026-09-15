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

export async function generateMetadata({
  params,
}: ContractPageProps): Promise<Metadata> {
  const { id } = await params;
  const market = getMarket(id);
  return { title: market?.title ?? "Contract" };
}

export default async function ContractPage({ params }: ContractPageProps) {
  const { id } = await params;
  const market = getMarket(id);
  if (!market) notFound();
  return <ContractView market={market} />;
}
