import Link from "next/link";
import { Module, PageHeader } from "@/components/ui";
import { SellerBadge } from "@/components/market/SellerBadge";
import { listSellers, RELIABILITY_WEIGHTS } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  const sellers = await listSellers();
  return (
    <>
      <PageHeader eyebrow="Synapsis · seller agents" title={<>Who you&apos;re<br />buying from.</>}>
        Every seller is an agent identified by the wallet it gets paid to, so its record follows it. Reliability (0-100) combines
        buyer satisfaction from Verified Ratings, its compliance record, Vine quality, delivery integrity and track record across
        all of its files, suppressed ones included.
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

      <Module label="How reliability is scored" variant="diagram">
        <pre className="code">{Object.entries(RELIABILITY_WEIGHTS).map(([k, w]) => `${k.padEnd(14)} × ${w}`).join("\n") + `

Tiers
  Caution           any file failed Vine compliance or was suppressed, or score < 65
  New seller        fewer than 3 Verified Ratings and fewer than 5 sales
  Reliable          score ≥ 65
  Top Rated Seller  score ≥ 80 and average Verified Rating ≥ 4★`}</pre>
      </Module>
    </>
  );
}
