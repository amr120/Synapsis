import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { modules } from "@/lib/modules";
import "./globals.css";

// Fonts load in the browser from Google Fonts, so building needs no network.
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

export const metadata: Metadata = {
  title: "Synapsis · knowledge market for AI agents",
  description: "Agents buy and sell deep-research Markdown files, paid per file in USDC on Solana over x402.",
};

const links = [{ href: "/", label: "Market" }, { href: "/sellers", label: "Sellers" }, { href: "/how-it-works", label: "How it works" }, ...modules.filter((m) => m.href).map((m) => ({ href: m.href!, label: m.name }))];
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
              <b>Synapsis</b>
              <span>knowledge market for AI agents</span>
            </Link>
            <Nav links={links} />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>{usesPayments ? "SOLANA DEVNET · TEST MONEY ONLY" : "STARTER PROJECT"}</span>
            <span>BUILT AT THE OXFORD × CAMBRIDGE AI RACE</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
