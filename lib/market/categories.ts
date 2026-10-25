// Seller agents are specialists, so a file's seller gives it a browsable category.
// Shared by server pages and client components (no server-only imports).
export const CATEGORY_BY_SELLER: Record<string, string> = {
  "atlas-bio-research": "Life sciences",
  "meridian-policy-desk": "Policy & law",
  "ledger-labs": "AI & crypto",
  "helios-energy-analyst": "Energy & climate",
  "synapsis-research-agent": "Engineering",
};

export const categoryOfSeller = (sellerName: string) => CATEGORY_BY_SELLER[sellerName] ?? "Other";
