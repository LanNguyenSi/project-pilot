import { describe, it, expect } from "vitest";
import { extractPreviewTasks } from "../src/services/forge-task-snapshot.js";

describe("extractPreviewTasks", () => {
  it("returns [] for a non-object preview", () => {
    expect(extractPreviewTasks(null)).toEqual([]);
    expect(extractPreviewTasks(undefined)).toEqual([]);
    expect(extractPreviewTasks("not an object")).toEqual([]);
  });

  it("returns [] when preview.tasks is missing or not an array", () => {
    expect(extractPreviewTasks({})).toEqual([]);
    expect(extractPreviewTasks({ tasks: "nope" })).toEqual([]);
  });

  it("keeps only entries with a string id and title, dropping malformed ones", () => {
    const result = extractPreviewTasks({
      tasks: [
        { id: "t1", title: "Valid" },
        { id: "t2" }, // missing title
        { title: "no id" },
        null,
        "not an object",
      ],
    });
    expect(result).toEqual([{ id: "t1", title: "Valid" }]);
  });

  it("does not add a dependsOn key when the source task has none (regression: v1 shape unchanged)", () => {
    const result = extractPreviewTasks({ tasks: [{ id: "t1", title: "Task one", wave: "Wave 1" }] });
    expect(result).toEqual([{ id: "t1", title: "Task one", wave: "Wave 1" }]);
    expect(result[0]).not.toHaveProperty("dependsOn");
  });

  it("extracts a valid dependsOn string array when present (forward-compatible parsing)", () => {
    const result = extractPreviewTasks({
      tasks: [{ id: "t2", title: "Task two", dependsOn: ["t1", "t0"] }],
    });
    expect(result[0]?.dependsOn).toEqual(["t1", "t0"]);
  });

  it("filters non-string entries out of dependsOn", () => {
    const result = extractPreviewTasks({
      tasks: [{ id: "t2", title: "Task two", dependsOn: ["t1", 42, null, "t0"] }],
    });
    expect(result[0]?.dependsOn).toEqual(["t1", "t0"]);
  });

  it("ignores a non-array dependsOn value", () => {
    const result = extractPreviewTasks({ tasks: [{ id: "t2", title: "Task two", dependsOn: "t1" }] });
    expect(result[0]).not.toHaveProperty("dependsOn");
  });

  it("drops an empty dependsOn array (normalized away, not kept as [])", () => {
    const result = extractPreviewTasks({ tasks: [{ id: "t2", title: "Task two", dependsOn: [] }] });
    expect(result[0]).not.toHaveProperty("dependsOn");
  });
});
