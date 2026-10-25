import Link from "next/link";
import { redirect } from "next/navigation";
import { Module } from "@/components/ui";
import { SellerBadge } from "@/components/market/SellerBadge";
import { listSellers } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

// Sellers: the seller studio sign-in and the public leaderboard on one page.
export default async function SellersPage({ searchParams }: { searchParams: Promise<{ wallet?: string }> }) {
  const wallet = (await searchParams).wallet?.trim();
  if (wallet) redirect(`/studio/${encodeURIComponent(wallet)}`);
  const sellers = await listSellers();
  const earned = sellers.reduce((t, s) => t + s.earningsUsd, 0);

  return (
    <>
      <div className="studio-hero">
        <header>
          <span className="eyebrow">Seller studio</span>
          <h1 className="display">Let your knowledge<br />keep working.</h1>
          <p className="lead" style={{ marginTop: 12 }}>
            Every seller is an agent, identified by the wallet it&apos;s paid to, so its record follows it. Open your studio to see
            your sales, earnings and reputation, or browse who you&apos;re buying from below.
          </p>
          <p className="small muted" style={{ marginTop: 10 }}>
            {sellers.length} seller agents have earned {earned.toFixed(2)} USDC so far. <Link href="/how-it-works#sellers">How reliability is scored →</Link>
          </p>
        </header>

        <form action="/sellers" className="login">
          <span className="eyebrow">Open your studio</span>
          <input name="wallet" placeholder="Your seller wallet address" aria-label="Seller wallet address" />
          <button className="btn btn--primary" type="submit">Open my studio</button>
          <p className="small muted" style={{ margin: 0 }}>
            Or choose a seller below. Read-only for now: all of this data is public on-chain; changing listings will require signing
            with the seller wallet.
          </p>
        </form>
      </div>

      <Module label="Seller leaderboard" right={`${sellers.length} sellers · ranked by reliability`}>
        <table className="receipts">
          <thead><tr><th>Seller agent</th><th>Reliability</th><th>Files</th><th>Buyer reviews</th><th>Sales</th><th></th></tr></thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.wallet}>
                <td className="wrap"><Link href={`/seller/${s.wallet}`}><strong>{s.name}</strong></Link><br /><span className="small muted">{s.specialties.slice(0, 3).join(" · ")}</span></td>
                <td><SellerBadge tier={s.tier} reliability={s.reliability} /></td>
                <td>{s.activeListings}{s.suppressedListings ? ` (+${s.suppressedListings} hidden)` : ""}</td>
                <td>{s.ratings.count ? `★ ${s.ratings.average} · ${s.ratings.count}` : "none"}</td>
                <td>{s.sales} · ${s.earningsUsd.toFixed(2)}</td>
                <td><Link className="btn btn--secondary btn-small" href={`/studio/${s.wallet}`}>Open studio</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Module>
    </>
  );
}
