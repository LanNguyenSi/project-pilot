import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Schema changes are applied by exactly one explicit step per environment.
// The backend image only starts the server: a restart needs no push, and a
// container start can no longer race the relay post_update push or hide a
// failed one.

const root = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

// Instruction lines only: drop full-line and trailing `#` comments so the
// explanatory comments may mention prisma.
const code = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, "").trimEnd())
    .filter((l) => l.trim() !== "")
    .join("\n");

const countMatches = (text: string, re: RegExp) =>
  (text.match(re) ?? []).length;

describe("backend image start command", () => {
  const dockerfile = code(read("backend/Dockerfile"));
  const cmdLines = dockerfile.split("\n").filter((l) => /^(CMD|ENTRYPOINT)\b/.test(l));

  it("has exactly one CMD that starts the server", () => {
    const cmds = cmdLines.filter((l) => /^CMD\b/.test(l));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain("dist/server.js");
  });

  it("calls no prisma command in CMD or ENTRYPOINT", () => {
    expect(cmdLines.length).toBeGreaterThan(0);
    for (const l of cmdLines) expect(l).not.toMatch(/prisma/i);
  });
});

describe("production schema step", () => {
  const relay = code(read(".relay.yml"));
  const prod = code(read("docker-compose.prod.yml"));

  it(".relay.yml post_update has exactly one prisma db push", () => {
    expect(countMatches(relay, /prisma\s+db\s+push/g)).toBe(1);
  });

  it("the push in .relay.yml passes no data-loss flag", () => {
    expect(relay).not.toContain("--accept-data-loss");
  });

  it("docker-compose.prod.yml runs no prisma command and no migrate service", () => {
    expect(prod).not.toMatch(/prisma/i);
    expect(prod).not.toMatch(/^\s{2}migrate:/m);
  });

  it("the backend service in docker-compose.prod.yml sets no command override", () => {
    const backend = prod.split(/^\s{2}backend:/m)[1]?.split(/^\s{2}frontend:/m)[0] ?? "";
    expect(backend).not.toMatch(/^\s{4}(command|entrypoint):/m);
  });
});
