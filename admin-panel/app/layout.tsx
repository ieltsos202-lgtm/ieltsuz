import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTSUZ Admin Panel",
  description: "Standalone live analytics dashboard for the IELTSUZ platform.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
