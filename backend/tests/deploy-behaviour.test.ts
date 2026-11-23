import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// These tests EXECUTE the deploy steps instead of matching their text: the
// commands run against stub `docker`, `sleep` and `git` executables placed
// first on PATH, so a loop that never terminates, a `|| true` that swallows a
// failed pull, or an `exit 1` turned into `exit 0` shows up as a wrong exit
// code or a wrong number of calls. Every spawn carries a timeout, and the
// `sleep` stub kills its parent shell if a loop asks for far more sleeps than
// any bounded wait could, so a broken loop cannot hang the suite or escape as
// a runaway process.
//
// The relay steps are read by parsing the two lists with the same structure
// `deploy-config.test.ts` already relies on (a top-level key, two-space `- `
// items, `>-` folded blocks folded into one line): the backend's dependencies
// and the root `node_modules` ship no YAML parser (neither `yaml` nor
// `js-yaml` resolves), so none is imported here. The parsed steps are then
// run through `/bin/sh -c`, so what is asserted is the behaviour of the text
// that is in the file.

const root = join(__dirname, "..", "..");

// Scratch space for the stubs and the Makefile copy; removed at the end.
const scratch = mkdtempSync(join(tmpdir(), "deploy-behaviour-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const DOCKER_STUB = `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$STUB_LOG"
case "$*" in
  *"exec -T frontend"*)
    if [ -f "$STUB_FRONTEND_COUNT" ]; then n=$(cat "$STUB_FRONTEND_COUNT"); else n=0; fi
    n=$((n+1)); printf '%s' "$n" > "$STUB_FRONTEND_COUNT"
    if [ "$n" -le "\${STUB_FRONTEND_FAIL_FIRST:-0}" ]; then exit 1; fi
    exit 0
    ;;
  *"pull db"*)
    if [ -n "$STUB_PULL_DB_FAIL" ]; then exit 1; fi
    exit 0
    ;;
  *"pull node:22-alpine"*)
    if [ -n "$STUB_PULL_NODE_FAIL" ]; then exit 1; fi
    exit 0
    ;;
esac
exit 0
`;

// Records every call and guards the suite against an unbounded loop: no
// bounded wait in the Makefile or .relay.yml sleeps more often than its own
// attempt budget (max 30), so hitting the cap means the loop lost its bound.
const SLEEP_STUB = `#!/bin/sh
printf 'sleep %s\\n' "$*" >> "$STUB_LOG"
if [ -f "$STUB_SLEEP_COUNT" ]; then n=$(cat "$STUB_SLEEP_COUNT"); else n=0; fi
n=$((n+1)); printf '%s' "$n" > "$STUB_SLEEP_COUNT"
if [ "$n" -gt "\${STUB_SLEEP_LIMIT:-60}" ]; then
  echo "stub sleep: unbounded loop ($n sleeps), stopping $PPID" >&2
  kill -TERM "$PPID" 2>/dev/null
  exit 1
fi
exit 0
`;

const GIT_STUB = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$STUB_LOG"
exit 0
`;

type StubOutcome = {
  pullDbFails?: boolean;
  pullNodeFails?: boolean;
  frontendFailsFirst?: number;
};

const scenario = () => {
  const dir = mkdtempSync(join(scratch, "case-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [name, body] of [
    ["docker", DOCKER_STUB],
    ["sleep", SLEEP_STUB],
    ["git", GIT_STUB],
  ] as const) {
    const path = join(bin, name);
    writeFileSync(path, body, { mode: 0o755 });
  }
  const log = join(dir, "calls.log");
  return {
    dir,
    log,
    calls: (): string[] => (readFileSync(log, "utf8").match(/^docker .*$/gm) ?? []),
    count: (needle: string) => countDockerCalls(readFileSync(log, "utf8"), needle),
    sleepCalls: (): number => Number(readFileSync(join(dir, "sleep.count"), "utf8") || "0"),
    hasSleepCounter: (): boolean => {
      try {
        readFileSync(join(dir, "sleep.count"), "utf8");
        return true;
      } catch {
        return false;
      }
    },
    env: (outcome: StubOutcome) => ({
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      STUB_LOG: log,
      STUB_FRONTEND_COUNT: join(dir, "frontend.count"),
      STUB_SLEEP_COUNT: join(dir, "sleep.count"),
      STUB_PULL_DB_FAIL: outcome.pullDbFails ? "1" : "",
      STUB_PULL_NODE_FAIL: outcome.pullNodeFails ? "1" : "",
      STUB_FRONTEND_FAIL_FIRST: String(outcome.frontendFailsFirst ?? 0),
    }),
  };
};

const countDockerCalls = (log: string, needle: string) =>
  log.split("\n").filter((l) => l.startsWith("docker ") && l.includes(needle)).length;

const RELAY_TRIES = 30;

// ---------------------------------------------------------------------------
// .relay.yml: parse the two lists by the structure deploy-config.test.ts uses
// ---------------------------------------------------------------------------

const relayList = (key: string): string[] => {
  const lines = readFileSync(join(root, ".relay.yml"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  expect(start, `.relay.yml has no ${key} key`).toBeGreaterThanOrEqual(0);
  const items: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^\s/.test(line)) break; // dedented: next top-level key
    const item = line.match(/^ {2}- (.*)$/);
    if (item) {
      const rest = item[1].trim();
      items.push(rest === ">-" || rest === ">" ? [] : [rest]);
    } else if (items.length > 0 && line.trim() !== "" && !/^\s*#/.test(line)) {
      items[items.length - 1].push(line.trim());
    }
  }
  return items.map((lines) => lines.join(" ").trim());
};

const preUpdate = relayList("pre_update");
const postUpdate = relayList("post_update");
const frontendGate = postUpdate.filter((s) => s.includes("exec -T frontend"));

const runStep = (entry: string, outcome: StubOutcome) => {
  const s = scenario();
  const r = spawnSync("/bin/sh", ["-c", entry], {
    cwd: s.dir,
    env: s.env(outcome),
    encoding: "utf8",
    timeout: 20000,
  });
  return { r, s };
};

describe("relay deploy steps run as written", () => {
  it("parses the two lists into the expected steps", () => {
    // Guards the parser itself: a step that vanished from the file must not
    // let the tests below pass vacuously.
    expect(preUpdate).toHaveLength(2);
    expect(preUpdate[0]).toBe("docker compose -f docker-compose.prod.yml pull db");
    expect(preUpdate[1]).toBe("docker pull node:22-alpine");
    expect(frontendGate).toHaveLength(1);
    expect(frontendGate[0]).toMatch(/^i=0; until docker compose .*exec -T frontend/);
    expect(frontendGate[0]).toContain("sleep 2");
  });

  it("pre_update step 1 pulls the db image, and a failing pull fails the step", () => {
    const ok = runStep(preUpdate[0], {});
    expect(ok.r.status, `stdout=${ok.r.stdout} stderr=${ok.r.stderr}`).toBe(0);
    expect(ok.s.calls()).toEqual(["docker compose -f docker-compose.prod.yml pull db"]);

    const bad = runStep(preUpdate[0], { pullDbFails: true });
    expect(bad.r.status, "a failed `pull db` must fail the pre_update step").not.toBe(0);
  });

  it("pre_update step 2 pulls the node base image, and a failing pull fails the step", () => {
    const ok = runStep(preUpdate[1], {});
    expect(ok.r.status).toBe(0);
    expect(ok.s.calls()).toEqual(["docker pull node:22-alpine"]);

    const bad = runStep(preUpdate[1], { pullNodeFails: true });
    expect(bad.r.status, "a failed `docker pull node:22-alpine` must fail the step").not.toBe(0);
  });

  it("frontend gate: a frontend that never answers fails after exactly 30 attempts", () => {
    const { r, s } = runStep(frontendGate[0], { frontendFailsFirst: 999 });
    expect(r.status, "a frontend that stays down must fail the step").not.toBe(0);
    expect(r.stderr).toContain("deploy failed");
    expect(s.count("exec -T frontend")).toBe(RELAY_TRIES);
    expect(s.sleepCalls()).toBe(RELAY_TRIES - 1);
  });

  it("frontend gate: a frontend that answers at once passes after one attempt", () => {
    const { r, s } = runStep(frontendGate[0], {});
    expect(r.status, `stderr=${r.stderr}`).toBe(0);
    expect(s.count("exec -T frontend")).toBe(1);
    expect(s.hasSleepCounter()).toBe(false);
  });

  it("frontend gate: a frontend that answers at attempt 7 passes after 7 attempts", () => {
    const { r, s } = runStep(frontendGate[0], { frontendFailsFirst: 6 });
    expect(r.status, `stderr=${r.stderr}`).toBe(0);
    expect(s.count("exec -T frontend")).toBe(7);
    expect(s.sleepCalls()).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Makefile: run `make deploy` from a copy of the Makefile inside the scratch
// directory, with the stubs first on PATH. The recipe only ever talks to
// docker through the stub, so the scratch cwd is enough.
// ---------------------------------------------------------------------------

const makeDeploy = (tries: number, interval: number, outcome: StubOutcome) => {
  const s = scenario();
  const copy = join(s.dir, "Makefile");
  copyFileSync(join(root, "Makefile"), copy);
  const r = spawnSync(
    "make",
    ["-f", copy, "deploy", `HEALTH_TRIES=${tries}`, `HEALTH_INTERVAL=${interval}`],
    { cwd: s.dir, env: s.env(outcome), encoding: "utf8", timeout: 20000 },
  );
  return { r, s };
};

const TRIES = 4;

describe("make deploy runs as written", () => {
  it("a failing `pull db` aborts before any image is built or any container is restarted", () => {
    const { r, s } = makeDeploy(TRIES, 1, { pullDbFails: true });
    expect(r.status, "a failed pull must fail the deploy").not.toBe(0);
    expect(s.count("pull db")).toBe(1);
    expect(s.calls().some((l) => l.includes("build"))).toBe(false);
    expect(s.calls().some((l) => l.includes("up -d"))).toBe(false);
    expect(s.calls().some((l) => l.includes("prisma"))).toBe(false);
    expect(s.count("exec -T frontend")).toBe(0);
  });

  it("pulls, builds, starts and pushes in order, then waits on the frontend", () => {
    const { r, s } = makeDeploy(TRIES, 1, {});
    expect(r.stdout + r.stderr, `stderr=${r.stderr}`).not.toContain("***");
    expect(r.status).toBe(0);
    const order = s.calls().map((l) => l.replace("docker compose -f docker-compose.prod.yml ", ""));
    expect(order.slice(0, 5)).toEqual([
      "pull db",
      "build --pull",
      "up -d",
      "exec -T -e HOME=/tmp backend npx prisma db push --schema=prisma/schema.prisma --skip-generate",
      "exec -T backend wget -q --spider http://localhost:3001/api/health",
    ]);
    expect(s.count("exec -T frontend")).toBe(1);
    expect(s.calls().some((l) => l.includes("AbortSignal.timeout(3000)"))).toBe(true);
  });

  it("a frontend that never answers fails after exactly HEALTH_TRIES attempts", () => {
    const { r, s } = makeDeploy(TRIES, 1, { frontendFailsFirst: 999 });
    expect(r.status, "a frontend that stays down must fail the deploy").not.toBe(0);
    expect(r.stderr).toContain("deploy failed: frontend :3000");
    expect(s.count("exec -T frontend")).toBe(TRIES);
    expect(s.sleepCalls()).toBe(TRIES - 1);
  });

  it("a frontend that answers at attempt 3 passes after 3 attempts", () => {
    const { r, s } = makeDeploy(TRIES, 1, { frontendFailsFirst: 2 });
    expect(r.status, `stderr=${r.stderr}`).toBe(0);
    expect(s.count("exec -T frontend")).toBe(3);
    expect(s.sleepCalls()).toBe(2);
  });

  it("runs `git pull` first, so a pull failure needs no build or restart", () => {
    const s = scenario();
    const copy = join(s.dir, "Makefile");
    copyFileSync(join(root, "Makefile"), copy);
    const r = spawnSync("make", ["-f", copy, "deploy", `HEALTH_TRIES=${TRIES}`, "HEALTH_INTERVAL=1"], {
      cwd: s.dir,
      env: s.env({}),
      encoding: "utf8",
      timeout: 20000,
    });
    expect(r.status).toBe(0);
    const git = readFileSync(s.log, "utf8").split("\n").findIndex((l) => l.startsWith("git pull"));
    expect(git).toBe(0);
  });
});
