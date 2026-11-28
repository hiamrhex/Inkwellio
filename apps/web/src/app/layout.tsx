import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { getMotionCssVars } from "@inkwellio/ui";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Inkwellio",
  description: "A calm home for match analysis, club history and long-form football culture.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${jakarta.variable} ${jetbrainsMono.variable} ${newsreader.variable} h-full antialiased`}
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
      <body className="min-h-full flex flex-col" style={getMotionCssVars() as CSSProperties}>
        {children}
        <script src="/scripts/landing-runtime.js" defer />
      </body>
    </html>
  );
}
