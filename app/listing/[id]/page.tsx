import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplorerLink, Led, Module, PageHeader } from "@/components/ui";
import { BuyListing } from "@/components/market/BuyListing";
import { signalsFor, summarize, trustOf, WEIGHTS, type SignalName } from "@/lib/market/ranking";
import { getSeller } from "@/lib/market/sellers";
import { getListing, listPurchases, listRatings } from "@/lib/market/store";

export const dynamic = "force-dynamic";

const SIGNAL_LABELS: Record<SignalName, string> = {
  satisfaction: "Satisfaction (Verified Ratings)",
  attestation: "Vine attestation",
  seller: "Seller reliability",
  sourceDensity: "Source density",
  compliance: "Compliance",
  earnings: "Earnings",
  velocity: "Call velocity (24h)",
  price: "Price",
};

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  if (!listing) notFound();
  const [ratings, purchases, seller] = await Promise.all([listRatings(listing.id), listPurchases(500), getSeller(listing.sellerWallet)]);
  const signals = signalsFor(listing, ratings, purchases, seller ? seller.stats.reliability / 100 : 0.5);
  const trust = trustOf(signals);
  const summary = summarize(ratings);
  const caps = listing.capabilities;
  const vine = listing.attestation;

  return (
    <>
      <PageHeader eyebrow={`Knowledge file · ${listing.topic}`} title={listing.title}>
        {listing.abstract}
      </PageHeader>

      {listing.status === "suppressed" && (
        <p className="notice notice--fault" style={{ margin: 0 }}>
          <strong>Suppressed:</strong> hidden from search and the Buy Box, still visible to its owner by link. Reason: {listing.suppressedReason}
        </p>
      )}

      <div className="stats">
        <div><span className="label">Trust score</span><span className="metric">{Math.round(trust * 100)}</span></div>
        <div><span className="label">Verified Rating</span><span className="metric">{summary.count ? `★ ${summary.average}` : "None yet"}</span><span className="small muted">{summary.count} paid {summary.count === 1 ? "purchase" : "purchases"} rated</span></div>
        <div><span className="label">Vine review</span><span className="metric">{vine ? `${vine.score}/100` : "Pending"}</span><span className="small muted">{vine ? `compliance ${vine.compliance}` : "new listing"}</span></div>
        <div><span className="label">Price</span><span className="metric">${listing.priceUsd}</span><span className="small muted">devnet USDC per copy</span></div>
      </div>

      <div className="cols">
        <Module label="Ranking signals · composite trust" right={`= ${trust.toFixed(3)}`}>
          <div className="signals">
            {(Object.keys(WEIGHTS) as SignalName[]).map((k) => (
              <div key={k} className="signal">
                <span>{SIGNAL_LABELS[k]}</span>
                <span className="bar"><span style={{ width: `${Math.round(signals[k] * 100)}%` }} /></span>
                <span className="mono small">{signals[k].toFixed(2)} × {WEIGHTS[k]}</span>
              </div>
            ))}
          </div>
        </Module>

        <Module label="Capability signature · for agents" right={caps ? `${caps.wordCount} words · ${caps.citationCount} citations` : "pending"}>
          {caps ? (
            <div className="stack">
              <div>
                <span className="label">Answers</span>
                <ul className="small tight">{caps.answers.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
              {caps.examples.length > 0 && (
                <div>
                  <span className="label">Example input → output</span>
                  {caps.examples.map((e) => (
                    <p key={e.input} className="small" style={{ margin: "6px 0" }}><strong>{e.input}</strong><br />→ {e.output}</p>
                  ))}
                </div>
              )}
              <div>
                <span className="label">Output schema · text/markdown sections</span>
                <p className="small mono" style={{ margin: "6px 0" }}>{caps.outline.join(" / ")}</p>
              </div>
            </div>
          ) : (
            <div className="empty">Structured metadata is being generated.</div>
          )}
        </Module>
      </div>

      <div className="cols">
        <Module label="Vine review · verifier agent" right={vine ? <><Led tone={vine.compliance === "pass" ? "ok" : "fault"} /> {vine.compliance}</> : "New"}>
          {vine ? (
            <div className="stack">
              <p className="small" style={{ margin: 0 }}>{vine.summary}</p>
              <ul className="checks">
                {vine.checks.map((c) => (
                  <li key={c.name}><span className={`tag ${c.pass ? "tag--ok" : "tag--fault"}`}>{c.pass ? "pass" : "fail"}</span><span><strong>{c.name}</strong>: {c.note}</span></li>
                ))}
              </ul>
              <span className="small muted">
                {vine.verifier} · {new Date(vine.attestedAt).toUTCString()}
                {vine.transaction ? <> · anchored on-chain <ExplorerLink signature={vine.transaction} /></> : null}
              </span>
            </div>
          ) : (
            <div className="empty">New listing: the Vine verifier reviews it before organic ratings exist.</div>
          )}
        </Module>

        <Module label="Verified Ratings · paid purchases only" right={summary.count ? `★ ${summary.average} (${summary.count})` : "none yet"}>
          {ratings.length === 0 ? (
            <div className="empty">No ratings yet. Only a buyer with a paid, on-chain purchase can rate.</div>
          ) : (
            <ul className="checks">
              {ratings.slice(0, 8).map((r) => (
                <li key={r.transaction}><span className="tag tag--ok">{"★".repeat(r.rating)}</span><span>{r.comment || "No comment"} <span className="small muted">· Verified Purchase <ExplorerLink signature={r.transaction} /></span></span></li>
              ))}
            </ul>
          )}
        </Module>
      </div>

      <div className="cols">
        <Module label="Listing · free" right={<><Led tone="ok" /> {listing.sales} sold</>}>
          <dl className="kv">
            <dt>Size</dt><dd>{listing.bytes.toLocaleString()} bytes of Markdown</dd>
            <dt>sha256</dt><dd>{listing.sha256}</dd>
            <dt>Seller</dt><dd><Link href={`/seller/${listing.sellerWallet}`}>{seller?.stats.name ?? listing.sellerName}</Link>{seller ? ` · ${seller.stats.tier} · reliability ${seller.stats.reliability}/100` : ""}</dd>
            <dt>Paid to</dt><dd><a href={`https://explorer.solana.com/address/${listing.sellerWallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{listing.sellerWallet}</a></dd>
            <dt>Listed</dt><dd>{new Date(listing.createdAt).toUTCString()}</dd>
            <dt>Tags</dt><dd>{listing.tags.join(", ")}</dd>
          </dl>
        </Module>

        <Module label="Buy it as an agent" variant="diagram">
          <pre className="code">{`# MCP
buy_knowledge(id: "${listing.id}")
rate_knowledge(id: "${listing.id}", transaction, rating)

# HTTP: 402 until paid over x402
GET /api/listings/${listing.id}/content
# then check sha256(markdown) ==
${listing.sha256}`}</pre>
        </Module>
      </div>

      <BuyListing listingId={listing.id} priceUsd={listing.priceUsd} />

      <p className="small"><Link href="/">← Back to the market</Link></p>
    </>
  );
}
