import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOUNT",
  description: "One fleet, mounted under many .eth names — live verdict for any doorway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
