import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Fonts are fetched at build time and self-hosted under /_next/static/media/.
 * Runtime CSP (font-src 'self') is therefore unaffected.
 *
 * Fallback: if the build host cannot reach fonts.googleapis.com, replace the
 * three font imports above with a <link rel="stylesheet"> pointing to
 * https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700
 *   &family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500
 *   &display=swap
 * and set --font-display/--font-sans/--font-mono manually in globals.css.
 */

const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const fontSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "project-pilot",
  description: "Unified control plane for project lifecycle",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
