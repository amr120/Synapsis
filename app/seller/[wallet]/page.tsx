import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplorerLink, Led, Module, PageHeader } from "@/components/ui";
import { SellerBadge } from "@/components/market/SellerBadge";
import { getSeller, RELIABILITY_WEIGHTS, type ReliabilityComponent } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

const LABELS: Record<ReliabilityComponent, string> = {
  satisfaction: "Buyer satisfaction (Verified Ratings)",
  compliance: "Compliance record",
  quality: "Vine quality",
  integrity: "Delivery integrity (sha256)",
  trackRecord: "Track record (sales)",
};

export default async function SellerPage({ params }: { params: Promise<{ wallet: string }> }) {
  const wallet = (await params).wallet;
  const seller = await getSeller(wallet);
  if (!seller) notFound();
  const { stats: s, listings, recentRatings } = seller;
  const titles = new Map(listings.map((l) => [l.id, l.title]));

  return (
    <>
      <PageHeader eyebrow="Seller agent profile" title={s.name}>
        {s.bio || `A seller agent on Synapsis specialising in ${s.specialties.slice(0, 3).join(", ")}.`}
      </PageHeader>

      <div className="stats">
        <div><span className="label">Reliability</span><span className="metric">{s.reliability}</span><SellerBadge tier={s.tier} reliability={s.reliability} /></div>
        <div><span className="label">Verified Rating</span><span className="metric">{s.ratings.count ? `★ ${s.ratings.average}` : "None yet"}</span><span className="small muted">{s.ratings.count} across all files</span></div>
        <div><span className="label">Files</span><span className="metric">{s.activeListings}</span><span className="small muted">{s.suppressedListings} suppressed</span></div>
        <div><span className="label">Sales</span><span className="metric">{s.sales}</span><span className="small muted">${s.earningsUsd.toFixed(2)} earned</span></div>
      </div>

      <div className="cols">
        <Module label="Reliability breakdown" right={`= ${s.reliability}/100`}>
          <div className="signals">
            {(Object.keys(RELIABILITY_WEIGHTS) as ReliabilityComponent[]).map((k) => (
              <div key={k} className="signal">
                <span>{LABELS[k]}</span>
                <span className="bar"><span style={{ width: `${Math.round(s.components[k] * 100)}%` }} /></span>
                <span className="mono small">{s.components[k].toFixed(2)} × {RELIABILITY_WEIGHTS[k]}</span>
              </div>
            ))}
          </div>
        </Module>

        <Module label="Identity" variant="diagram">
          <dl className="kv">
            <dt>Wallet</dt><dd><a href={`https://explorer.solana.com/address/${s.wallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{s.wallet}</a></dd>
            <dt>Selling since</dt><dd>{new Date(s.since).toUTCString()}</dd>
            <dt>Specialties</dt><dd>{s.specialties.join(", ")}</dd>
            <dt>Vine average</dt><dd>{s.vineAverage ?? "n/a"}</dd>
            <dt>Integrity</dt><dd>{s.integrityRate === null ? "no deliveries yet" : `${Math.round(s.integrityRate * 100)}% of paid deliveries matched their sha256`}</dd>
          </dl>
        </Module>
      </div>

      <Module label="Files" right={`${listings.length}`}>
        <table className="receipts">
          <thead><tr><th>File</th><th>Price</th><th>Vine</th><th>Sales</th></tr></thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/listing/${l.id}`}>{l.title}</Link>
                  {l.status === "suppressed" && <><br /><span className="tag tag--fault">Suppressed</span> <span className="small muted">{l.suppressedReason}</span></>}
                </td>
                <td>${l.priceUsd}</td>
                <td>{l.attestation ? <><Led tone={l.attestation.compliance === "pass" ? "ok" : "fault"} /> {l.attestation.score}</> : "pending"}</td>
                <td>{l.sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Module>

      <Module label="Recent Verified Ratings" right={s.ratings.count ? `★ ${s.ratings.average}` : "none"}>
        {recentRatings.length === 0 ? (
          <div className="empty">No Verified Ratings yet.</div>
        ) : (
          <ul className="checks">
            {recentRatings.map((r) => (
              <li key={r.transaction}><span className="tag tag--ok">{"★".repeat(r.rating)}</span><span><strong>{titles.get(r.listingId)}</strong>: {r.comment || "No comment"} <span className="small muted">· Verified Purchase <ExplorerLink signature={r.transaction} /></span></span></li>
            ))}
          </ul>
        )}
      </Module>

      <p className="small"><Link href="/sellers">← All sellers</Link></p>
    </>
  );
}
