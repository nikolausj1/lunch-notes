import type { Metadata, Viewport } from "next";
import { Caveat, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-ui",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
});

const DESCRIPTION =
  "On my first son's first day of preschool, I put a small drawing in his " +
  "lunchbox so he would have a smile for lunch. Over 2,000 drawings later, " +
  "they've become little paper time capsules: everything my sons loved, " +
  "one school lunch at a time, since 2019.";

export const metadata: Metadata = {
  metadataBase: new URL("https://lunchboxdrawings.com"),
  title: "Lunch Box Drawings",
  description: DESCRIPTION,
  openGraph: {
    title: "Lunch Box Drawings",
    description: DESCRIPTION,
    url: "/",
    siteName: "Lunch Box Drawings",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lunch Box Drawings",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Safari tints its chrome with this; lib/theme.ts keeps it current
  themeColor: "#fbf8ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${caveat.variable}`}>{children}</body>
    </html>
  );
}
