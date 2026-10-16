import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Fonts are vendored under src/fonts (see the README there) and loaded
 * through next/font/local, so `next build` never contacts Google Fonts.
 * Each family declares one face per subset the Google CSS served (latin,
 * latin-ext, and where they exist cyrillic, cyrillic-ext, greek, greek-ext,
 * vietnamese), each with that subset's unicode-range, so the browser fetches
 * a subset file only when a glyph in that range is rendered. All faces of a
 * family share one family name; only the latin face is preloaded and carries
 * the fallback metrics adjustment, which covers the family.
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
const fontDisplayLatinExt = localFont({
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontDisplayVietnamese = localFont({
  src: [
    { path: "../fonts/space-grotesk-vietnamese-wght-normal.woff2", weight: "500 700", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
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
const fontSansLatinExt = localFont({
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansCyrillic = localFont({
  src: [
    { path: "../fonts/inter-cyrillic-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansCyrillicExt = localFont({
  src: [
    { path: "../fonts/inter-cyrillic-ext-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansGreek = localFont({
  src: [
    { path: "../fonts/inter-greek-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansGreekExt = localFont({
  src: [
    { path: "../fonts/inter-greek-ext-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+1F00-1FFF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontSansVietnamese = localFont({
  src: [
    { path: "../fonts/inter-vietnamese-wght-normal.woff2", weight: "400 600", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
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
const fontMonoLatinExt = localFont({
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontMonoCyrillic = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-cyrillic-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontMonoCyrillicExt = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-cyrillic-ext-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontMonoGreek = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-greek-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- evaluated for its @font-face CSS
const fontMonoVietnamese = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-vietnamese-wght-normal.woff2", weight: "400 500", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
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
