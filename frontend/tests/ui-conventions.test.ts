import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Plain-node structural checks over the frontend/src source tree. No jsdom,
// no component rendering, no new dependencies: just fs + regex, walking the
// same files a reviewer would grep.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Strip comments so matches inside prose/documentation don't count:
 * - block comments (`/* ... *\/`, including JSDoc and `{/* JSX *\/}`)
 * - line comments, only when `//` starts the trimmed line (a real `//` that
 *   happens to sit inside a string, e.g. "http://...", is left alone)
 */
function stripComments(content: string): string {
  const noBlocks = content.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");
}

const files = walk(SRC_ROOT);
const codeByFile = new Map(files.map((f) => [f, stripComments(fs.readFileSync(f, "utf8"))]));

describe("ui conventions", () => {
  it("fetches /api/auth/me from exactly one place in code (AuthContext)", () => {
    // Everywhere else that references it should be a comment explaining the
    // dedupe (see AuthProvider in lib/auth-context.tsx) - those are already
    // stripped above. If this count moves, either a consumer re-added its
    // own fetch, or AuthProvider's own fetch was duplicated/removed.
    const hits: string[] = [];
    for (const [file, code] of codeByFile) {
      const matches = code.match(/\/api\/auth\/me/g);
      if (matches) {
        for (let i = 0; i < matches.length; i++) hits.push(file);
      }
    }
    expect(hits).toEqual([path.join(SRC_ROOT, "lib/auth-context.tsx")]);
  });

  it("has no legacy empty-value fallback glyphs left (unified on the middle dot ·)", () => {
    // Calibrated against the 6 known pre-fix occurrences (df38d4b1 followups,
    // see commit 1196abb): dashboard StatCard (x2, plain hyphen "-"), the
    // tasks board claimedBy fallback + empty-column placeholder, and the
    // deploys history commit/duration fallbacks (x2, em-dash "-").
    //
    // Two shapes to catch:
    //   1. an operator-fed fallback: `?? "-"`, `|| "-"`, `? "-" :`, `: "-"`
    //      (or the em-dash equivalents) - this is how all 6 original spots
    //      were written.
    //   2. a bare JSX text child that is only the glyph, e.g. `>-</p>`.
    //
    // Deliberately NOT matched: comments (stripped above), prose that merely
    // contains an em-dash (e.g. InstallRelayWizard's "Installing relay -
    // this may take a few minutes..."), and unrelated hyphen literals like
    // `.replace(/[^a-z0-9-]+/g, "-")` or `.lastIndexOf("-")` - those aren't
    // preceded by a fallback operator and aren't a bare JSX text node.
    const FALLBACK_OPERATOR_RE = /(\?\?|\|\||\?|:)\s*["'](-|—)["']/g;
    const BARE_JSX_TEXT_RE = />\s*(-|—)\s*</g;

    const hits: { file: string; match: string }[] = [];
    for (const [file, code] of codeByFile) {
      for (const re of [FALLBACK_OPERATOR_RE, BARE_JSX_TEXT_RE]) {
        for (const m of code.matchAll(re)) {
          hits.push({ file: path.relative(SRC_ROOT, file), match: m[0] });
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
