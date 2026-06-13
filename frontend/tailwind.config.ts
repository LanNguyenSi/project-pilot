import type { Config } from "tailwindcss";
import { colors, fontSize, spacing, borderRadius, transitionDuration, boxShadow } from "./src/lib/design-tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand:   colors.brand,
        surface: colors.surface,
        stroke:  colors.stroke,
        content: colors.content,
        accent:  colors.accent,
      },
      fontFamily: {
        // Wired via CSS vars set by next/font in layout.tsx
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans:    ["var(--font-sans)",    "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "monospace"],
      },
      fontSize,
      spacing,
      borderRadius,
      boxShadow,
      transitionDuration,
    },
  },
  plugins: [],
};

export default config;
