import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Inkwellio",
  description: "A writing platform for independent publications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        {/*
         * theme.js — blocking inline-free zero-FOUC theme bootstrap.
         * Sets data-theme on <html> before first paint.
         * CSP hash/nonce must be added before strict CSP ships.
         */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/scripts/theme.js" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
