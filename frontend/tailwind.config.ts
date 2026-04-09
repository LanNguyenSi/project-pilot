import type { Config } from "tailwindcss";
import { colors, fontSize, spacing, borderRadius, transitionDuration } from "./src/lib/design-tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: colors.surface,
        stroke: colors.stroke,
        content: colors.content,
        accent: colors.accent,
      },
      fontSize,
      spacing,
      borderRadius,
      transitionDuration,
    },
  },
  plugins: [],
};

export default config;
