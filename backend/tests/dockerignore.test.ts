// Build-context tests for the two images (build context is the repo root for
// both: `docker build -f backend/Dockerfile .`, `-f frontend/Dockerfile .`).
//
// The root `.dockerignore` is an allow list (`*` first, then `!` entries). No
// docker and no dockerignore package are available here (there is no
// @balena/dockerignore under node_modules), so the file is matched with the
// small matcher below plus the fixture table that pins what it means. The
// modelled semantics are the ones the Docker allow-list idiom documents:
//
// 1. a path is matched by every pattern whose dockerignore glob matches it
//    (`*` and `?` never cross `/`, `**` spans any number of segments, so a bare
//    `*` matches only top-level names);
// 2. the last matching pattern wins: plain = exclude, `!` = include;
// 3. a path no pattern matches is NOT in the context: the list is an allow list
//    from `*`, so a stray file next to an allowed one (`backend/id_rsa`) stays
//    out even though the list re-enters that directory;
// 4. an ancestor directory whose winning pattern excludes it prunes the subtree
//    (the `**/node_modules` layer therefore prunes everything below a
//    node_modules directory);
// 5. a pruned directory is re-entered when a later `!` pattern addresses it or
//    something below it, which is what makes `*` plus a `!backend/src/...` entry
//    work;
// 6. parent matching, as in Docker's pattern matcher (measured with BuildKit):
//    a `!` pattern whose glob matches an ancestor directory also matches every
//    path below it, so `*` plus a lone `!backend/src` includes all of
//    backend/src and a paired `!dir/**` entry is belt-and-braces, not needed.
//
// The check for the COPY lines is deliberately two-sided: every file a Dockerfile
// COPYs from the context must be in the context, and a list of the files those
// builds read must stay in it too (a whole-directory COPY like `COPY backend
// ./backend` copies the files that survive the filter, so dropping one `!` entry
// has to show up as a missing build input).
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

type Rule = { negate: boolean; pattern: string; re: RegExp; prefix: string };

function patternToRegExp(pattern: string): RegExp {
  const segs = pattern.split("/");
  let src = "^";
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === "**") {
      src += last ? ".+$" : "(?:[^/]+/)*";
      return;
    }
    let body = "";
    for (const ch of seg) {
      if (ch === "*") body += "[^/]*";
      else if (ch === "?") body += "[^/]";
      else if ("\\^$.|+()[]{}".includes(ch)) body += "\\" + ch;
      else body += ch;
    }
    src += body + (last ? "$" : "/");
  });
  return new RegExp(src);
}

/** Literal head of a pattern, used for the re-entry rule of the model. */
function literalPrefix(pattern: string): string {
  const head: string[] = [];
  for (const seg of pattern.split("/")) {
    if (/[*?]/.test(seg)) break;
    head.push(seg);
  }
  return head.join("/");
}

function parseDockerignore(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    const pattern = (negate ? line.slice(1) : line).replace(/\/+$/, "");
    rules.push({
      negate,
      pattern,
      re: patternToRegExp(pattern),
      prefix: literalPrefix(pattern),
    });
  }
  return rules;
}

/**
 * Docker's pattern matcher also matches parent paths: a `!` pattern whose glob
 * matches an ancestor of the path matches the whole subtree below it. Plain
 * (excluding) patterns do not need this here, the ancestor pruning below
 * models their subtree effect.
 */
function ruleMatches(rule: Rule, path: string): boolean {
  if (rule.re.test(path)) return true;
  if (rule.negate) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (rule.re.test(parts.slice(0, i).join("/"))) return true;
    }
  }
  return false;
}

function lastMatching(path: string, rules: Rule[]): number {
  let index = -1;
  rules.forEach((rule, i) => {
    if (ruleMatches(rule, path)) index = i;
  });
  return index;
}

/** True when the path is part of the build context. */
function isInContext(path: string, rules: Rule[]): boolean {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const index = lastMatching(dir, rules);
    if (index >= 0 && !rules[index].negate) {
      const reentered = rules.some(
        (rule, j) =>
          j > index &&
          rule.negate &&
          (rule.prefix === dir || rule.prefix.startsWith(`${dir}/`)),
      );
      if (!reentered) return false;
    }
  }
  const index = lastMatching(path, rules);
  return index >= 0 && rules[index].negate;
}

/**
 * Every source path of a COPY that reads from the build context (a COPY with
 * `--from=` reads from another stage, which the ignore file never touches).
 */
function contextCopySources(dockerfile: string): string[] {
  const text = read(dockerfile).replace(/\\\s*\n/g, " ");
  const sources: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [instruction, ...args] = line.split(/\s+/);
    if (instruction.toUpperCase() !== "COPY") continue;
    if (args.some((arg) => arg.startsWith("--from="))) continue;
    for (const arg of args.slice(0, -1)) {
      if (!arg.startsWith("--")) sources.push(arg);
    }
  }
  return [...new Set(sources)];
}

const DOCKERFILES = ["backend/Dockerfile", "frontend/Dockerfile"];
const rules = parseDockerignore(read(".dockerignore"));
const inContext = (path: string) => isInContext(path, rules);

/**
 * Files the two builds read (`npm ci` from the root lockfile, `prisma generate`
 * + `tsc` for the backend, `next build` for the frontend). One entry per `!`
 * entry of the allow list, so dropping an entry removes a build input here.
 */
const BUILD_INPUTS = [
  "package.json",
  "package-lock.json",
  "backend/package.json",
  "backend/tsconfig.json",
  "backend/prisma/schema.prisma",
  "backend/src/server.ts",
  "backend/src/app.ts",
  "backend/src/routes/health.ts",
  "backend/src/config/index.ts",
  "frontend/package.json",
  "frontend/tsconfig.json",
  "frontend/next.config.ts",
  "frontend/postcss.config.mjs",
  "frontend/eslint.config.mjs",
  "frontend/src/app/layout.tsx",
  "frontend/src/app/globals.css",
  "frontend/src/fonts",
  "frontend/public/.gitkeep",
  "mcp/package.json",
];

describe("matcher for .dockerignore semantics (fixture)", () => {
  const fixture = parseDockerignore(
    [
      "*",
      "!src",
      "!src/**",
      "!docs/README.md",
      "!a/b/c",
      "!a/b/c/d.ts",
      "**/node_modules",
      "**/.env*",
      "single?",
    ].join("\n"),
  );
  const at = (path: string) => isInContext(path, fixture);

  it("matches the allow-list cases", () => {
    expect(at("src/a.ts")).toBe(true);
    expect(at("src/deep/nested/a.ts")).toBe(true);
    expect(at("README.md")).toBe(false);
    expect(at("id_rsa")).toBe(false);
    expect(at("docs/README.md")).toBe(true);
    expect(at("docs/other.md")).toBe(false);
    // Parent matching (rule 6): a `!dir` entry covers everything below the
    // directory, no `/**` twin needed; a nested path outside it stays out.
    expect(at("a/b/c")).toBe(true);
    expect(at("a/b/c/d.ts")).toBe(true);
    expect(at("a/b/c/other.ts")).toBe(true);
    expect(at("a/b/x.ts")).toBe(false);
  });

  it("matches the second-layer and glob cases", () => {
    expect(at("src/node_modules/left-pad/index.js")).toBe(false);
    expect(at("node_modules")).toBe(false);
    expect(at("src/.env")).toBe(false);
    expect(at("src/deep/.env.local")).toBe(false);
    expect(at("single1")).toBe(false);
    expect(at("subdir/single1")).toBe(false);
    // `*` does not cross a separator, so a nested name is only out because the
    // allow list never names it.
    expect(at("subdir/x/y.md")).toBe(false);
  });

  it("does not treat a bare pattern as matching a nested path", () => {
    expect(patternToRegExp("*").test("backend/id_rsa")).toBe(false);
    expect(patternToRegExp("**/node_modules").test("node_modules")).toBe(true);
    expect(patternToRegExp("backend/src/**").test("backend/src")).toBe(false);
    expect(patternToRegExp("backend/src/**").test("backend/src/a/b.ts")).toBe(
      true,
    );
  });
});

describe("build context of both images contains what the Dockerfiles COPY", () => {
  const sources = DOCKERFILES.flatMap(contextCopySources);

  it("reads the COPY lines of both Dockerfiles", () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(sources).toContain("package-lock.json");
    expect(sources).toContain("mcp/package.json");
    expect(sources).toContain("backend/prisma");
  });

  it("every file a Dockerfile COPYs from the context is in the context", () => {
    const files = sources.filter((src) => {
      const abs = join(ROOT, src);
      return existsSync(abs) && statSync(abs).isFile();
    });
    expect(files.length).toBeGreaterThan(0);
    for (const src of files) expect(inContext(src)).toBe(true);
  });

  it("every build input is in the context", () => {
    for (const input of BUILD_INPUTS) {
      expect(existsSync(join(ROOT, input)), `${input} must exist`).toBe(true);
      expect(inContext(input), `${input} excluded from the context`).toBe(true);
    }
  });

  it("every `dir/**` allow-list entry is paired with a `!dir` entry (style)", () => {
    // Parent matching (rule 6) makes the `/**` twin belt-and-braces, not
    // required, so this is a style check that keeps the two forms paired.
    const negated = rules.filter((rule) => rule.negate);
    for (const rule of negated) {
      if (!rule.pattern.endsWith("/**")) continue;
      const dir = rule.pattern.slice(0, -"/**".length);
      expect(
        negated.some((other) => other.pattern === dir),
        `${rule.pattern} has no !${dir} entry; the /** twin is belt-and-braces ` +
          "(BuildKit includes the whole subtree of a !dir entry on its own), " +
          "but the allow list pairs the two forms by style",
      ).toBe(true);
    }
  });
});

describe("build context of both images stays free of secrets and host junk", () => {
  it("the list really is an allow list: its first rule excludes everything", () => {
    // The "no pattern matched means not in the context" rule of the model below
    // only holds because this first rule is there; without it the file would be
    // a deny list and every unlisted path would be in the context.
    expect(rules[0].pattern).toBe("*");
    expect(rules[0].negate).toBe(false);
  });


  it.each([
    // Stray files next to allowed sources: the allow list never names them.
    "backend/id_rsa",
    "backend/deploy_key",
    "secrets.json",
    ".env-backup",
    ".env",
    "docs/runbook.md",
    "node_modules/left-pad/index.js",
    ".git/config",
    // Names the second layer prunes even inside an allowed directory.
    "backend/.env",
    "backend/src/.env.local",
    "frontend/.env.production",
    "backend/src/server.pem",
    "frontend/src/db.key",
    "backend/src/.npmrc",
    "backend/src/node_modules/left-pad/index.js",
    "backend/dist/server.js",
    "frontend/src/.next/cache/lock",
    "backend/coverage/lcov.info",
    // A coverage directory inside an allowed directory: only the second layer
    // keeps it out there (the allow list alone would include it).
    "frontend/src/coverage/lcov.info",
    "frontend/src/x.tsbuildinfo",
    // Databases and journal files (the old denylist had these, the second
    // layer keeps them out inside the allowed directories).
    "backend/prisma/dev.db",
    "backend/prisma/dev.db-journal",
    "frontend/public/x.db",
  ])("%s is excluded", (path) => {
    expect(inContext(path)).toBe(false);
  });
});
