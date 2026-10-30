import type { Metadata } from "next";
import { ExplorerExperience } from "@/components/explorer/ExplorerExperience";

export const metadata: Metadata = {
  title: "Market Explorer",
  description:
    "Explore Rwanda land-market benchmarks, administrative areas, mapped parcels and development context."
};

type ExplorerPageProps = {
  params: Promise<{ area?: string[] }>;
};

export default async function ExplorerPage({ params }: ExplorerPageProps) {
  const { area = [] } = await params;
  return <ExplorerExperience initialAreaPath={area} />;
}
