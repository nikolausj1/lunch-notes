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
  "On my first son's first day of preschool, I put a small astronaut drawing " +
  "in his lunchbox so he'd have a smile for lunch. More than two thousand " +
  "school-day drawings later, they're all here.";

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
