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

// Service blocks from the production compose file: the keys indented by
// exactly two spaces under `services:`, each block running to the next such
// key and ending where the file dedents to a top-level key.
const serviceBlocks = (prod: string): Array<[string, string[]]> => {
  const lines = prod.split("\n");
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  expect(start).toBeGreaterThanOrEqual(0);
  const blocks: Array<[string, string[]]> = [];
  let current: string[] | null = null;
  for (const l of lines.slice(start + 1)) {
    if (l.trim() !== "" && !/^\s/.test(l)) break;
    const name = l.match(/^ {2}([^\s:#][^:]*):\s*$/)?.[1];
    if (name !== undefined) {
      current = [];
      blocks.push([name, current]);
    } else if (current !== null) {
      current.push(l);
    }
  }
  return blocks;
};

// The deploy target's recipe only: its tab-indented block, so the dev
// targets' pushes are not part of the parsed text.
const makefileDeployTarget = () => {
  const lines = read("Makefile").split("\n");
  const start = lines.findIndex((l) => /^deploy:/.test(l));
  expect(start).toBeGreaterThanOrEqual(0);
  const recipe: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\t/.test(l)) recipe.push(l);
    else if (l.trim() === "") continue;
    else break;
  }
  return code(recipe.join("\n"));
};

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

describe("production schema steps skip client generation", () => {
  // Lines that invoke the CLI, not lines that merely mention `prisma db push`
  // in a comment or an echo: the comments and messages carry no `npx` call.
  const pushCalls = (text: string) =>
    code(text)
      .split("\n")
      .filter((l) => /npx\s+prisma\s+db\s+push/.test(l));

  const sources: Array<[string, () => string]> = [
    [".relay.yml", () => read(".relay.yml")],
    ["Makefile deploy target", makefileDeployTarget],
    ["scripts/restore.sh", () => read("scripts/restore.sh")],
  ];

  for (const [name, text] of sources) {
    it(`${name}: has exactly one prisma db push call and it passes --skip-generate`, () => {
      const calls = pushCalls(text());
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("--skip-generate");
    });
  }

  it("the Dockerfile copies node_modules/.prisma without --chown", () => {
    const copies = code(read("backend/Dockerfile"))
      .split("\n")
      .filter((l) => /^COPY\b.*\/\.prisma\b/.test(l));
    expect(copies).toHaveLength(1);
    expect(copies[0]).not.toContain("--chown");
  });
});

describe("dev compose schema step", () => {
  const dev = code(read("docker-compose.yml"));
  const service = (name: string) =>
    dev.split(new RegExp(`^\\s{2}${name}:`, "m"))[1]?.split(/^\s{2}\S[^:]*:\s*$/m)[0] ?? "";

  it("has a one-shot migrate service that runs prisma db push", () => {
    const migrate = service("migrate");
    expect(migrate).toMatch(/prisma["',\s]+db["',\s]+push/);
    expect(migrate).toMatch(/^\s{4}restart:\s*"?no"?/m);
  });

  it("starts the backend only after migrate completed successfully", () => {
    const backend = service("backend");
    expect(backend).toMatch(/^\s{6}migrate:\s*\n\s{8}condition:\s*service_completed_successfully/m);
  });
});

describe("production compose project", () => {
  const prod = code(read("docker-compose.prod.yml"));

  // The project name decides the database volume (project-pilot_pgdata). An
  // unpinned name follows the checkout directory, so a checkout under another
  // name would start against a new, empty volume.
  it("pins the project name to project-pilot", () => {
    expect(prod).toMatch(/^name: project-pilot$/m);
  });

  it("the frontend image binds the standalone server to all interfaces", () => {
    // Docker sets HOSTNAME to the container id; the image healthcheck probes
    // localhost, so the server must not bind to that id alone.
    expect(read("frontend/Dockerfile")).toMatch(/^ENV HOSTNAME=0\.0\.0\.0$/m);
  });

  it("guards POSTGRES_PASSWORD wherever it is interpolated", () => {
    expect(prod).not.toMatch(/\$\{POSTGRES_PASSWORD\}/);
    expect(countMatches(prod, /\$\{POSTGRES_PASSWORD:\?[^}]+\}/g)).toBeGreaterThanOrEqual(2);
  });
});

describe("production resource limits", () => {
  const prod = code(read("docker-compose.prod.yml"));

  it("every service with mem_limit also caps CPU, each cpus a number in (0, 1]", () => {
    const blocks = serviceBlocks(prod);
    // An empty or broken parse must fail here, not pass vacuously.
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    let withMemLimit = 0;
    for (const [name, body] of blocks) {
      if (!body.some((l) => /^ {4}mem_limit:/.test(l))) continue;
      withMemLimit += 1;
      const cpusLine = body.find((l) => /^ {4}cpus:/.test(l));
      expect(cpusLine, `${name}: has mem_limit but no cpus`).toBeDefined();
      const raw = cpusLine!.match(/cpus:\s*"?([^"\s#]+)"?/)?.[1];
      const value = Number(raw);
      expect(raw, `${name}: cpus value missing`).toBeDefined();
      expect(Number.isNaN(value), `${name}: cpus "${raw}" is not a number`).toBe(false);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(withMemLimit).toBeGreaterThanOrEqual(3);
  });
});

describe("production container hardening", () => {
  const prod = code(read("docker-compose.prod.yml"));
  const bodyOf = (name: string) => {
    const found = serviceBlocks(prod).find(([n]) => n === name);
    expect(found, `service ${name} not found`).toBeDefined();
    return found![1].join("\n");
  };

  // Every container blocks exec-time privilege gain (setuid/setgid binaries,
  // file capabilities).
  it("every service sets security_opt with no-new-privileges", () => {
    const blocks = serviceBlocks(prod);
    // An empty or broken parse must fail here, not pass vacuously.
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const [name, lines] of blocks) {
      const text = lines.join("\n");
      expect(text, `${name}: no security_opt`).toMatch(/security_opt:/);
      expect(text, `${name}: security_opt without no-new-privileges`).toMatch(
        /no-new-privileges:true/,
      );
    }
  });

  it("backend and frontend drop every capability", () => {
    for (const name of ["backend", "frontend"]) {
      const text = bodyOf(name);
      expect(text, `${name}: no cap_drop`).toMatch(
        /cap_drop:\s*\[\s*ALL\s*\]|cap_drop:\s*\n\s*-\s*ALL\b/,
      );
    }
  });

  // The postgres entrypoint starts as root and uses gosu to drop to the
  // `postgres` user and chown the data directory, which needs CHOWN, SETUID,
  // SETGID, DAC_OVERRIDE and FOWNER (commented in the compose file), so db
  // keeps its capabilities and only gets security_opt.
  it("db keeps its capabilities: no cap_drop on the db service", () => {
    const text = bodyOf("db");
    expect(text).not.toMatch(/cap_drop/);
    expect(text).toMatch(/no-new-privileges:true/);
  });
});

describe("deploy refreshes the images it builds on", () => {
  const relay = code(read(".relay.yml"));
  const deployRecipe = makefileDeployTarget();

  it("make deploy pulls the db image and builds with --pull", () => {
    expect(deployRecipe).toMatch(
      /docker compose -f docker-compose\.prod\.yml pull db(?=\s|$)/,
    );
    expect(deployRecipe).toMatch(
      /docker compose -f docker-compose\.prod\.yml build --pull(?=\s|$)/,
    );
  });

  const preUpdate = () => {
    const start = relay.indexOf("pre_update:");
    expect(start).toBeGreaterThanOrEqual(0);
    return relay.slice(start, relay.indexOf("post_update:"));
  };

  it(".relay.yml pre_update pulls the compose db service's image", () => {
    expect(preUpdate()).toMatch(
      /docker compose -f docker-compose\.prod\.yml pull db(?=\s|$)/,
    );
    // `pull db` refreshes a base image only because db pins an `image:`.
    const db = serviceBlocks(code(read("docker-compose.prod.yml"))).find(
      ([n]) => n === "db",
    );
    expect(db?.[1].join("\n")).toMatch(/^ {4}image:\s*\S+/m);
  });

  // A pulled name drifting from a Dockerfile FROM (either direction) means a
  // deploy path builds on a base image it never refreshes.
  it("the node base image pre_update pulls is exactly the one both Dockerfiles build FROM", () => {
    const pulled = new Set(
      [...preUpdate().matchAll(/^ *- docker pull (\S+)$/gm)].map((m) => m[1]),
    );
    expect(pulled.size).toBeGreaterThan(0);
    const bases = new Set<string>();
    for (const file of ["backend/Dockerfile", "frontend/Dockerfile"]) {
      for (const l of code(read(file)).split("\n")) {
        const m = l.match(/^FROM\s+(\S+)/);
        if (m) bases.add(m[1]);
      }
    }
    expect(bases.size).toBeGreaterThan(0);
    expect(pulled).toEqual(bases);
  });
});

describe("frontend health gate in both deploy paths", () => {
  const relay = code(read(".relay.yml"));
  const deployRecipe = makefileDeployTarget();

  // The same check as the frontend image's HEALTHCHECK: the standalone
  // server must answer on port 3000 before the deploy counts as done. Each
  // attempt carries a 3 s AbortSignal timeout, the same budget as the image
  // HEALTHCHECK, so a frontend that accepts the connection but never answers
  // fails one attempt in 3 s instead of waiting for fetch's own timeout.
  const waitCmd =
    /docker compose -f docker-compose\.prod\.yml exec -T frontend node -e "fetch\('http:\/\/localhost:3000', \{ signal: AbortSignal\.timeout\(3000\) \}\)/;

  it("make deploy waits a bounded number of tries for the frontend", () => {
    expect(deployRecipe).toMatch(waitCmd);
    expect(deployRecipe).toMatch(/frontend .*HEALTH_TRIES.*attempts/s);
  });

  // Without the signal a hung attempt (TCP accepted, no response) costs the
  // full fetch timeout per try instead of 3 s.
  it("both gates abort a hung attempt after 3 s", () => {
    expect(countMatches(deployRecipe, /AbortSignal\.timeout\(3000\)/g)).toBe(1);
    expect(countMatches(relay, /AbortSignal\.timeout\(3000\)/g)).toBe(1);
  });

  it(".relay.yml post_update waits a bounded number of tries for the frontend, after the schema push", () => {
    const waitAt = relay.search(waitCmd);
    expect(waitAt).toBeGreaterThanOrEqual(0);
    expect(relay.indexOf("post_update:")).toBeLessThan(waitAt);
    expect(relay.indexOf("prisma db push")).toBeLessThan(waitAt);
    // Bounded: a frontend that stays down fails the step, it never loops on.
    expect(relay.slice(waitAt)).toMatch(/\$i -ge \d+.*exit 1/s);
  });
});
