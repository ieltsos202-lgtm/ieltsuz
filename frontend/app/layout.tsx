import type { Metadata, Viewport } from "next";

import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ieltsuz.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "IELTSUZ — AI IELTS tayyorgarlik platformasi | IELTS online kurs",
    template: "%s | IELTSUZ",
  },
  description:
    "IELTSUZ — O'zbekistondagi eng yaxshi AI IELTS tayyorgarlik platformasi. Listening, Reading, Writing va Speaking — to'rt ko'nikma bo'yicha sun'iy intellektdan tezkor baho va tahlil oling. Haqiqiy Cambridge testlari, shaxsiy o'quv reja va band score kuzatuvi. IELTS online o'rganing.",
  keywords: [
    "IELTS",
    "IELTSUZ",
    "IELTS Uzbekistan",
    "IELTS O'zbekiston",
    "IELTS tayyorgarlik",
    "IELTS online kurs",
    "IELTS o'rganish",
    "IELTS Toshkent",
    "AI IELTS",
    "IELTS speaking practice",
    "IELTS writing checker",
    "IELTS mock test",
    "IELTS band score",
    "Cambridge IELTS",
    "ingliz tili IELTS",
    "IELTS imtihon",
    "IELTS test online",
  ],
  authors: [{ name: "IELTSUZ" }],
  creator: "IELTSUZ",
  publisher: "IELTSUZ",
  applicationName: "IELTSUZ",
  category: "education",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    alternateLocale: ["en_US", "ru_RU"],
    url: SITE_URL,
    siteName: "IELTSUZ",
    title: "IELTSUZ — AI IELTS tayyorgarlik platformasi",
    description:
      "To'rt IELTS ko'nikmasini AI yordamida mashq qiling. Tezkor baho, haqiqiy Cambridge testlari va shaxsiy o'quv reja. O'zbekistonning #1 IELTS platformasi.",
  },
  twitter: {
    card: "summary_large_image",
    title: "IELTSUZ — AI IELTS tayyorgarlik platformasi",
    description:
      "To'rt IELTS ko'nikmasini AI yordamida mashq qiling. O'zbekistonning #1 IELTS platformasi.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  verification: {
    // Add your Google Search Console verification code here after deploy:
    // google: "your-google-site-verification-code",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "IELTSUZ",
  alternateName: "IELTS UZ",
  url: SITE_URL,
  description:
    "AI-powered IELTS preparation platform for Uzbekistan. Practice Listening, Reading, Writing and Speaking with instant AI feedback and real Cambridge tests.",
  sameAs: ["https://t.me/ieltsosuzb"],
  offers: {
    "@type": "Offer",
    category: "IELTS preparation",
    priceCurrency: "UZS",
    price: process.env.NEXT_PUBLIC_MONTHLY_PRICE_UZS || "49000",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="notranslate">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
