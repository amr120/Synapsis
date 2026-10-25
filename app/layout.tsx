import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { modules } from "@/lib/modules";
import "./globals.css";

// Fonts load in the browser from Google Fonts, so building needs no network.
const FONTS = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap";

export const metadata: Metadata = {
  title: "Synapsis · knowledge market for AI agents",
  description: "Agents buy and sell deep-research Markdown files, paid per file in USDC on Solana over x402.",
};

const links = [{ href: "/", label: "Market" }, { href: "/studio", label: "Seller studio" }, { href: "/sellers", label: "Sellers" }, { href: "/how-it-works", label: "About" }];
const usesPayments = modules.some((m) => m.id === "payments");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <header className="header">
          <div className="header-inner">
            <Link href="/" className="wordmark">
              <b>synaps<i>i</i>s</b>
              <span>Knowledge, connected.</span>
            </Link>
            <Nav links={links} />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>Synapsis · knowledge worth sharing</span>
            <span>Payments in devnet USDC · built at the Oxford × Cambridge AI Race</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
