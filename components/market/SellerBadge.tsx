import type { SellerTier } from "@/lib/market/sellers";

const TONE: Record<SellerTier, string> = {
  "Top Rated Seller": "tag--ok",
  Reliable: "tag--signal",
  "New seller": "tag--warn",
  Caution: "tag--fault",
};

/** A seller agent's tier and reliability score, e.g. "Top Rated Seller · 88". */
export function SellerBadge({ tier, reliability }: { tier: SellerTier; reliability: number }) {
  return <span className={`tag ${TONE[tier]}`} title="Seller reliability across all its files (0-100)">{tier} · {reliability}</span>;
}
