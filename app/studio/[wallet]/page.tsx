import { SellerDashboard } from "@/components/market/SellerDashboard";

export const dynamic = "force-dynamic";

// Seller studio: a seller's own view of its sales, earnings, reputation and publishing agent.
export default async function StudioPage({ params }: { params: Promise<{ wallet: string }> }) {
  return <SellerDashboard wallet={(await params).wallet} mode="studio" />;
}
