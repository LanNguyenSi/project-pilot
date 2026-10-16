import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Fonts are vendored under src/fonts (see the README there) and loaded
 * through next/font/local, so `next build` never contacts Google Fonts.
 * Each family has a latin face and a latin-ext face with the unicode-range
 * the Google CSS used, so the browser fetches latin-ext only when a glyph in
 * that range is rendered. Both faces share one family name; the latin-ext
 * faces are neither preloaded nor given their own fallback metrics (the
 * latin face's fallback adjustment covers the family).
 */

const fontDisplay = localFont({
  src: [
    { path: "../fonts/space-grotesk-latin-wght-normal.woff2", weight: "500 700", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
  variable: "--font-display",
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontDisplayExt = localFont({
  src: [
    { path: "../fonts/space-grotesk-latin-ext-wght-normal.woff2", weight: "500 700", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

const fontSans = localFont({
  src: [
    { path: "../fonts/inter-latin-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
  variable: "--font-sans",
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansExt = localFont({
  src: [
    { path: "../fonts/inter-latin-ext-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

const fontMono = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
  variable: "--font-mono",
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontMonoExt = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-latin-ext-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
  preload: false,
  adjustFontFallback: false,
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
