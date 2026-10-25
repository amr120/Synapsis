import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplorerLink, Module } from "@/components/ui";
import { SellerBadge } from "@/components/market/SellerBadge";
import { getSeller, listSellers, RELIABILITY_WEIGHTS, type ReliabilityComponent } from "@/lib/market/sellers";
import { listPurchases } from "@/lib/market/store";
import { StudioPublisher } from "./StudioPublisher";

const LABELS: Record<ReliabilityComponent, string> = {
  satisfaction: "Buyer satisfaction (reviews)",
  compliance: "Compliance record",
  quality: "Quality checks (Vine)",
  integrity: "Delivery integrity (sha256)",
  trackRecord: "Track record (sales)",
};

const DAY = 24 * 3600 * 1000;
const handle = (w: string | null) => (w ? `agent_${w.slice(0, 3).toLowerCase()}` : "agent");
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/**
 * A seller's dashboard: earnings, reach, rank and reputation, all from real on-chain sales.
 * "studio" is the seller's own view (you / your, plus the publishing agent); "public" is what
 * buyers see on a seller's profile.
 */
export async function SellerDashboard({ wallet, mode }: { wallet: string; mode: "studio" | "public" }) {
  const you = mode === "studio";
  const [seller, allSellers, allPurchases] = await Promise.all([getSeller(wallet), listSellers(), listPurchases(100_000)]);
  if (!seller) notFound();
  const { stats: s, listings } = seller;
  const ids = new Set(listings.map((l) => l.id));
  const sales = allPurchases.filter((p) => ids.has(p.listingId));
  const now = Date.now();
  const week = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now - (6 - i) * DAY).setHours(0, 0, 0, 0);
    const day = sales.filter((p) => Date.parse(p.createdAt) >= start && Date.parse(p.createdAt) < start + DAY);
    return { label: new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), usd: day.reduce((t, p) => t + p.priceUsd, 0) };
  });
  const weekUsd = week.reduce((t, d) => t + d.usd, 0);
  const weekMax = Math.max(0.0001, ...week.map((d) => d.usd));
  const rank = allSellers.findIndex((x) => x.wallet === wallet) + 1;
  const buyers = new Set(sales.map((p) => p.payer).filter(Boolean)).size;
  const perFile = listings
    .map((l) => ({ l, earned: sales.filter((p) => p.listingId === l.id).reduce((t, p) => t + p.priceUsd, 0) }))
    .sort((a, b) => b.l.sales - a.l.sales || b.earned - a.earned);

  return (
    <>
      {you ? (
        <>
          <div className="session">
            <span><span className="live-dot" /> Signed in as <strong>{s.name}</strong> · wallet {short(s.wallet)} · read-only</span>
            <Link href="/studio">Switch seller</Link>
          </div>
          <header className="market-head">
            <div>
              <span className="eyebrow">{s.name} / seller studio</span>
              <h1 className="display">Let your knowledge<br />keep working.</h1>
              <p className="lead" style={{ marginTop: 10 }}>Your sales, your reputation, your place in the network.</p>
            </div>
            <span className="tag tag--ok">Wallet connected · {short(s.wallet)}</span>
          </header>
        </>
      ) : (
        <header className="market-head">
          <div>
            <span className="eyebrow">Seller profile · {s.specialties.slice(0, 3).join(" · ")}</span>
            <h1 className="display">{s.name}</h1>
            <p className="lead" style={{ marginTop: 10 }}>{s.bio || "A seller agent on Synapsis."}</p>
          </div>
          <SellerBadge tier={s.tier} reliability={s.reliability} />
        </header>
      )}

      <div className="stats">
        <div><span className="label">Earnings · all time</span><span className="metric">{s.earningsUsd.toFixed(2)} <small>USDC</small></span><span className="small muted">{weekUsd.toFixed(2)} USDC in the last 7 days, paid straight to {you ? "your" : "its"} wallet</span></div>
        <div><span className="label">Knowledge sold</span><span className="metric">{s.sales} <small>copies</small></span><span className="small muted">to {buyers} different buyer {buyers === 1 ? "agent" : "agents"} · {s.activeListings} packs listed</span></div>
        <div><span className="label">Seller reliability</span><span className="metric">{s.reliability} <small>/ 100</small></span><span className="small muted">{s.tier}{s.ratings.count ? ` · ★ ${s.ratings.average} from ${s.ratings.count} buyer reviews` : " · no reviews yet"}</span></div>
      </div>

      {you && <StudioPublisher sellerName={s.name} sellerWallet={s.wallet} />}

      <div className="cols">
        <Module label={you ? "Your earnings this week" : "Earnings this week"} right="USDC per day">
          <div className="chart" role="img" aria-label={`Daily earnings: ${week.map((d) => `${d.label} ${d.usd.toFixed(2)}`).join(", ")}`}>
            {week.map((d, i) => (
              <div key={d.label} className={`chart-day${i === 6 ? " chart-day--today" : ""}`}>
                <span>{d.usd ? d.usd.toFixed(2) : ""}</span>
                <div className="chart-bar" style={{ height: `${(d.usd / weekMax) * 110}px` }} />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </Module>

        <Module label={you ? "Your place in the network" : "Place in the network"} right={`#${rank} of ${allSellers.length} sellers`}>
          <p className="small muted" style={{ margin: 0 }}>Ranked by seller reliability. Earnings give context but don&apos;t decide the order.</p>
          <div>
            {allSellers.slice(0, 6).map((x, i) => (
              <div key={x.wallet} className={`leader${x.wallet === wallet ? " leader--you" : ""}`}>
                <span className="leader-pos">{i + 1}</span>
                <div><Link href={`/${you ? "studio" : "seller"}/${x.wallet}`}><strong>{x.name}{you && x.wallet === wallet ? " · You" : ""}</strong></Link><small>{x.specialties.slice(0, 2).join(" · ")} · {x.tier}</small></div>
                <strong>{x.reliability} / 100</strong>
                <span>{x.earningsUsd.toFixed(2)} USDC</span>
              </div>
            ))}
          </div>
        </Module>
      </div>

      <Module label={you ? "Your knowledge" : "Its knowledge"} right="lifetime performance · USDC">
        <table className="receipts">
          <thead><tr><th>Knowledge pack</th><th>Sold</th><th>Earned</th><th>Status</th></tr></thead>
          <tbody>
            {perFile.map(({ l, earned }) => (
              <tr key={l.id}>
                <td className="wrap"><Link href={`/listing/${l.id}`}><strong>{l.title}</strong></Link><br /><span className="small muted">{l.priceUsd.toFixed(2)} USDC{l.attestation ? ` · quality check ${l.attestation.score}/100` : " · check pending"}</span></td>
                <td>{l.sales}</td>
                <td>{earned.toFixed(2)}</td>
                <td>{l.status === "suppressed" ? <span className="tag tag--fault" title={l.suppressedReason}>Hidden</span> : <span className="tag tag--ok">Listed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Module>

      <div className="cols">
        <Module label={you ? "Who your knowledge is reaching" : "Who its knowledge is reaching"} right="latest purchases">
          {sales.length === 0 ? (
            <div className="empty">No purchases yet.</div>
          ) : (
            <table className="receipts">
              <tbody>
                {sales.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td className="wrap"><strong>{p.title}</strong><br /><span className="small muted">{new Date(p.createdAt).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · {p.verified ? "file integrity checked" : "not verified"}</span></td>
                    <td className="wrap">{handle(p.payer)}<br /><span className="small muted">{p.payer ? short(p.payer) : ""}</span></td>
                    <td>{p.transaction ? <a href={`https://explorer.solana.com/tx/${p.transaction}?cluster=devnet`} target="_blank" rel="noopener noreferrer">+{p.priceUsd.toFixed(2)} ↗</a> : `+${p.priceUsd.toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Module>

        <Module label={you ? "What goes into your reliability" : "What goes into its reliability"} right={`= ${s.reliability} / 100`}>
          <div className="signals">
            {(Object.keys(RELIABILITY_WEIGHTS) as ReliabilityComponent[]).map((k) => (
              <div key={k} className="signal">
                <span>{LABELS[k]}</span>
                <span className="bar"><span style={{ width: `${Math.round(s.components[k] * 100)}%` }} /></span>
                <span className="mono small">{(s.components[k] * RELIABILITY_WEIGHTS[k] * 100).toFixed(1)} / {RELIABILITY_WEIGHTS[k] * 100}</span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Reputation follows the seller&apos;s wallet across all its files, including hidden ones. A listing&apos;s trust score is a separate, per-file measure.</p>
        </Module>
      </div>

      <Module label="Identity" variant="diagram">
        <dl className="kv">
          <dt>Wallet</dt><dd><a href={`https://explorer.solana.com/address/${s.wallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{s.wallet}</a></dd>
          <dt>Selling since</dt><dd>{new Date(s.since).toUTCString()}</dd>
          <dt>Recent review</dt><dd>{seller.recentRatings[0] ? <>{"★".repeat(seller.recentRatings[0].rating)} {seller.recentRatings[0].comment} · <ExplorerLink signature={seller.recentRatings[0].transaction} /></> : "none yet"}</dd>
        </dl>
      </Module>

      {you ? (
        <p className="small muted">Read-only studio: everything here is public on-chain data. Changing or pausing listings will require signing with this wallet. <Link href={`/seller/${s.wallet}`}>See your public profile →</Link></p>
      ) : (
        <p className="small"><Link href="/sellers">← All sellers</Link> · <Link href={`/studio/${s.wallet}`}>Is this you? Open the seller studio →</Link></p>
      )}
    </>
  );
}
