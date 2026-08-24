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

export const metadata: Metadata = {
  title: "Lunch Box Drawings",
  description:
    "Daily Post-it drawings made for my sons' lunches — an interactive desk of little paper artifacts.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // charcoal desk is the default — the picker's effect lifts the attribute
    // when a saved light color is restored
    <html lang="en" data-desk-dark="true">
      <body className={`${nunito.variable} ${caveat.variable}`}>{children}</body>
    </html>
  );
}
