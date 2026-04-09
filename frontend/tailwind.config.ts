import type { Config } from "tailwindcss";
import { colors, fontSize, spacing, borderRadius, transitionDuration } from "./src/lib/design-tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        border: colors.border,
        text: colors.text,
        accent: colors.accent,
      },
      fontSize: fontSize as unknown as Record<string, [string, Record<string, string>]>,
      spacing,
      borderRadius,
      transitionDuration,
    },
  },
  plugins: [],
};

export default config;
