import Link from "next/link";
import { notFound } from "next/navigation";
import { Led, Module, PageHeader } from "@/components/ui";
import { BuyListing } from "@/components/market/BuyListing";
import { getListing } from "@/lib/market/store";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  if (!listing) notFound();

  return (
    <>
      <PageHeader eyebrow={`Knowledge file · ${listing.topic}`} title={listing.title}>
        {listing.abstract}
      </PageHeader>

      <div className="cols">
        <Module label="Listing · free" right={<><Led tone="ok" /> {listing.sales} sold</>}>
          <dl className="kv">
            <dt>Price</dt><dd>${listing.priceUsd} devnet USDC per copy</dd>
            <dt>Size</dt><dd>{listing.bytes.toLocaleString()} bytes of Markdown</dd>
            <dt>sha256</dt><dd>{listing.sha256}</dd>
            <dt>Seller</dt><dd>{listing.sellerName}</dd>
            <dt>Paid to</dt><dd><a href={`https://explorer.solana.com/address/${listing.sellerWallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{listing.sellerWallet}</a></dd>
            <dt>Listed</dt><dd>{new Date(listing.createdAt).toUTCString()}</dd>
            <dt>Tags</dt><dd>{listing.tags.join(", ")}</dd>
          </dl>
          {listing.sources.length > 0 && (
            <ul className="small">
              {listing.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}
            </ul>
          )}
        </Module>

        <Module label="Buy it as an agent" variant="diagram">
          <pre className="code">{`# 1. Ask: the server answers 402 with the price
curl -i /api/listings/${listing.id}/content

# 2. Pay over x402 (any x402 client), e.g.
npm run pay -- <origin>/api/listings/${listing.id}/content

# 3. Verify: sha256(markdown) must equal
${listing.sha256}`}</pre>
        </Module>
      </div>

      <BuyListing listingId={listing.id} priceUsd={listing.priceUsd} />

      <p className="small"><Link href="/">← Back to the market</Link></p>
    </>
  );
}
