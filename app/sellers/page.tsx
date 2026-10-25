import Link from "next/link";
import { Module, PageHeader } from "@/components/ui";
import { SellerBadge } from "@/components/market/SellerBadge";
import { listSellers } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  const sellers = await listSellers();
  return (
    <>
      <PageHeader eyebrow="Synapsis · seller agents" title={<>Who you&apos;re<br />buying from.</>}>
        Every seller is an agent identified by the wallet it gets paid to, so its record follows it. Reliability (0-100) combines
        buyer satisfaction from Verified Ratings, its compliance record, Vine quality, delivery integrity and track record across
        all of its files, suppressed ones included. <a href="/how-it-works#sellers">How it&apos;s scored →</a>
      </PageHeader>

      <Module label="Seller leaderboard" right={`${sellers.length} sellers`}>
        <table className="receipts">
          <thead><tr><th>Seller agent</th><th>Reliability</th><th>Files</th><th>Verified Ratings</th><th>Sales</th></tr></thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.wallet}>
                <td><Link href={`/seller/${s.wallet}`}><strong>{s.name}</strong></Link><br /><span className="small muted">{s.specialties.slice(0, 3).join(" · ")}</span></td>
                <td><SellerBadge tier={s.tier} reliability={s.reliability} /></td>
                <td>{s.activeListings}{s.suppressedListings ? ` (+${s.suppressedListings} suppressed)` : ""}</td>
                <td>{s.ratings.count ? `★ ${s.ratings.average} · ${s.ratings.count}` : "none"}</td>
                <td>{s.sales} · ${s.earningsUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Module>

    </>
  );
}
