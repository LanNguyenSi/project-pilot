/**
 * The backend image must carry its own production default: the placeholder-secret
 * and downstream-service-URL refusals in src/config only run with
 * NODE_ENV=production, so a bare `docker run` of the image (no compose file to
 * inject the variable) has to get it from the image itself. The compose files
 * keep their say: a service `environment:` value overrides an image ENV, and the
 * development stack relies on that to run the same image with NODE_ENV=development.
 *
 * No docker here, so this reads the three files and checks the relationship
 * between them; the image build and the container default are replayed by the
 * release canary.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** ENV lines of one build stage, from its FROM to the next FROM. */
function stageEnv(dockerfile: string, stage: string): string[] {
  const lines = read(dockerfile)
    .replace(/\\\s*\n/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const start = lines.findIndex((line) =>
    new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${stage}$`, "i").test(line),
  );
  expect(start, `stage ${stage} not found`).toBeGreaterThan(-1);
  const env: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^FROM\s/i.test(line)) break;
    if (/^ENV\s/i.test(line)) env.push(line);
  }
  return env;
}

/** The `environment:` map of one compose service, as key: value strings. */
function composeEnvironment(file: string, service: string): Record<string, string> {
  const lines = read(file).split("\n");
  const serviceStart = lines.findIndex(
    (line) => new RegExp(`^  ${service}:$`).test(line),
  );
  expect(serviceStart, `service ${service} not found in ${file}`).toBeGreaterThan(
    -1,
  );
  const env: Record<string, string> = {};
  let inEnvironment = false;
  for (const line of lines.slice(serviceStart + 1)) {
    if (/^  \S/.test(line)) break;
    if (/^    environment:$/.test(line)) {
      inEnvironment = true;
      continue;
    }
    if (!inEnvironment) continue;
    const match = line.match(/^      ([A-Z0-9_]+):\s*(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
    else if (/^\S|^    \S/.test(line)) inEnvironment = false;
  }
  return env;
}

describe("backend image defaults to production", () => {
  it("the runner stage sets NODE_ENV=production", () => {
    const env = stageEnv("backend/Dockerfile", "runner");
    expect(env.some((line) => /^ENV\s+NODE_ENV=production$/.test(line))).toBe(
      true,
    );
  });

  it("the runner stage is the image, so the ENV applies to a bare docker run", () => {
    const stages = read("backend/Dockerfile")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^FROM\s+\S+\s+AS\s+\S+$/i.test(line))
      .map((line) => line.split(/\s+/).pop());
    expect(stages.at(-1)).toBe("runner");
  });

  it("the development stack overrides it to development for the backend service", () => {
    // The dev compose file builds this same Dockerfile, whose last stage is the
    // runner stage, so the image it runs carries NODE_ENV=production and the
    // compose value is what makes the dev stack development.
    expect(read("docker-compose.yml")).toMatch(
      /dockerfile:\s*backend\/Dockerfile/,
    );
    expect(composeEnvironment("docker-compose.yml", "backend").NODE_ENV).toBe(
      "development",
    );
  });

  it("the production stack agrees with the image default", () => {
    expect(composeEnvironment("docker-compose.prod.yml", "backend").NODE_ENV).toBe(
      "production",
    );
  });
});
