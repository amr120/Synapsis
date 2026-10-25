import { SellerDashboard } from "@/components/market/SellerDashboard";

export const dynamic = "force-dynamic";

// Public seller profile: what buyers see about a seller agent.
export default async function SellerPage({ params }: { params: Promise<{ wallet: string }> }) {
  return <SellerDashboard wallet={(await params).wallet} mode="public" />;
}
