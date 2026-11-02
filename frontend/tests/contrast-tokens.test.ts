import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast gate over the dark token set in globals.css. All four
// surfaces are dark and the app renders 12 px text in --content-tertiary on
// every one of them (dashboard/deploys meta lines, text-label, placeholders),
// so the token must clear 4.5:1 against each. --danger-solid and its hover
// token back white button labels and must clear 4.5:1 too.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
}

function relLuminance(hex: string): number {
  const c = hex.slice(1);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const AA_TEXT = 4.5;

describe("globals.css contrast tokens", () => {
  const surfaces = {
    "surface-base": "#0c0c0f",
    "surface-raised": "#16161b",
    "surface-overlay": "#1f1f26",
    "surface-elevated": "#292932",
  };

  it("keeps the four surface literals in sync with the CSS tokens", () => {
    for (const [name, expected] of Object.entries(surfaces)) {
      expect(token(name)).toBe(expected);
    }
  });

  it("gives --content-tertiary at least 4.5:1 on every surface", () => {
    const fg = token("content-tertiary");
    for (const [name, bg] of Object.entries(surfaces)) {
      expect(contrast(fg, bg), `content-tertiary on ${name}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps --content-tertiary visibly dimmer than --content-secondary", () => {
    expect(relLuminance(token("content-tertiary"))).toBeLessThan(
      relLuminance(token("content-secondary")),
    );
  });

  it("gives white text at least 4.5:1 on --danger-solid and its hover token", () => {
    const white = "#ffffff";
    expect(contrast(white, token("danger-solid"))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(white, token("danger-solid-hover"))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
