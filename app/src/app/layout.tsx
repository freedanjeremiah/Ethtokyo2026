import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Satoshi (Indian Type Foundry, via Fontshare, ITF Free Font License): the face the ENS Manager app uses.
const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FNS · Fleet Naming Service",
  description: "One agent fleet mounted under many .eth names, verified live from chain.",
};

export const viewport: Viewport = {
  // Light is pinned: the dashboard is projected in a judging hall, like the ENS Manager app it sits beside.
  themeColor: "#f6f6f6",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={satoshi.variable}>
      <body>{children}</body>
    </html>
  );
}
