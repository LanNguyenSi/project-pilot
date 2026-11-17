import { describe, expect, it } from "vitest";
import { serviceHintLists } from "../src/lib/service-hints";

const services = (
  forge: "connected" | "error" | "not_configured" | "unreadable",
  tasks: "connected" | "error" | "not_configured" | "unreadable",
  deploy: "connected" | "error" | "not_configured" | "unreadable",
) => [
  { label: "Project Forge", state: forge },
  { label: "Agent Tasks", state: tasks },
  { label: "Deploy Panel", state: deploy },
];

describe("serviceHintLists", () => {
  it("returns two empty lists when every service is connected", () => {
    expect(serviceHintLists(services("connected", "connected", "connected"))).toEqual({
      notConfigured: [],
      unreachable: [],
    });
  });

  it("lists a single not-configured service and nothing as unreachable", () => {
    expect(serviceHintLists(services("connected", "connected", "not_configured"))).toEqual({
      notConfigured: ["Deploy Panel"],
      unreachable: [],
    });
  });

  it("lists a single error service and nothing as not configured", () => {
    expect(serviceHintLists(services("connected", "error", "connected"))).toEqual({
      notConfigured: [],
      unreachable: ["Agent Tasks"],
    });
  });

  it("splits a mixed set by state, keeping input order within each list", () => {
    expect(serviceHintLists(services("not_configured", "error", "not_configured"))).toEqual({
      notConfigured: ["Project Forge", "Deploy Panel"],
      unreachable: ["Agent Tasks"],
    });
  });

  it("leaves an unreadable service out of both lists (it has its own hint card)", () => {
    expect(serviceHintLists(services("unreadable", "connected", "connected"))).toEqual({
      notConfigured: [],
      unreachable: [],
    });
    expect(serviceHintLists(services("unreadable", "not_configured", "error"))).toEqual({
      notConfigured: ["Agent Tasks"],
      unreachable: ["Deploy Panel"],
    });
  });
});
