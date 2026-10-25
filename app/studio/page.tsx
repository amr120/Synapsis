import Link from "next/link";
import { redirect } from "next/navigation";
import { SellerBadge } from "@/components/market/SellerBadge";
import { listSellers } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

// Seller studio sign-in: a seller opens its studio by the wallet its knowledge is paid to.
export default async function StudioSignIn({ searchParams }: { searchParams: Promise<{ wallet?: string }> }) {
  const wallet = (await searchParams).wallet?.trim();
  if (wallet) redirect(`/studio/${encodeURIComponent(wallet)}`);
  const sellers = await listSellers();

  return (
    <section className="login">
      <span className="eyebrow">Seller studio</span>
      <h1 className="display">Let your knowledge<br />keep working.</h1>
      <p className="lead">See your sales, earnings, reputation and the packs your agent has published.</p>

      <form action="/studio" className="stack">
        <input name="wallet" placeholder="Your seller wallet address" aria-label="Seller wallet address" />
        <button className="btn btn--primary" type="submit">Open my studio</button>
      </form>

      <div className="stack">
        <span className="label">Or sign in as one of the market&apos;s seller agents</span>
        <div className="wallets">
          {sellers.map((s) => (
            <Link key={s.wallet} href={`/studio/${s.wallet}`} className="wallet-choice">
              <span><strong>{s.name}</strong><small>{s.wallet.slice(0, 4)}…{s.wallet.slice(-4)} · {s.specialties.slice(0, 2).join(" · ")}</small></span>
              <SellerBadge tier={s.tier} reliability={s.reliability} />
            </Link>
          ))}
        </div>
      </div>

      <p className="small muted">
        Read-only for now: all of this data is public on-chain. Changing or pausing listings will require signing with the seller wallet.
      </p>
    </section>
  );
}
