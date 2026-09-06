import { describe, expect, it } from "vitest";

import { domainOf, normalizeIssue, parseExport, projectOf } from "./beads.js";

describe("projectOf", () => {
  it("strips the trailing token of a beads id", () => {
    expect(projectOf("northwind-platform-a1b")).toBe("northwind-platform");
    expect(projectOf("ops-7")).toBe("ops");
  });

  it("keeps an id without a hyphen as its own project", () => {
    expect(projectOf("solo")).toBe("solo");
  });
});

describe("domainOf", () => {
  it("reads the domain label and ignores the rest", () => {
    expect(domainOf(["repo:x", "domain:SecOps"])).toBe("SecOps");
    expect(domainOf(["repo:x"])).toBeUndefined();
  });
});

describe("parseExport", () => {
  const row = (extra: Record<string, unknown>): string =>
    JSON.stringify({ id: "proj-a1", title: "Do the thing", status: "open", priority: 1, ...extra });

  it("parses bd export rows with export-shaped dependencies", () => {
    const issues = parseExport(
      row({
        labels: ["domain:CloudOps"],
        dependencies: [{ issue_id: "proj-a1", depends_on_id: "proj-b2", type: "blocks" }],
      }),
    );
    expect(issues).toHaveLength(1);
    const i = issues[0];
    expect(i?.project).toBe("proj");
    expect(i?.domain).toBe("CloudOps");
    expect(i?.dependencies).toEqual([{ from: "proj-a1", to: "proj-b2", type: "blocks" }]);
  });

  it("accepts the bd show dependency shape", () => {
    const issues = parseExport(
      row({ dependencies: [{ id: "proj-b2", title: "Other", dependency_type: "parent-child" }] }),
    );
    expect(issues[0]?.dependencies).toEqual([
      { from: "proj-a1", to: "proj-b2", type: "parent-child" },
    ]);
  });

  it("skips records that are not issues, such as memories", () => {
    const text = `${JSON.stringify({ key: "memory", content: "x" })}\n${row({})}\n`;
    expect(parseExport(text)).toHaveLength(1);
  });

  it("ignores blank lines", () => {
    expect(parseExport(`\n${row({})}\n\n`)).toHaveLength(1);
  });

  it("fails loudly on invalid JSON with the line number", () => {
    expect(() => parseExport(`${row({})}\n{not json`)).toThrow(/line 2/);
  });

  it("fills defaults for missing optional fields", () => {
    const i = normalizeIssue({ id: "p-1", title: "t" });
    expect(i?.status).toBe("open");
    expect(i?.priority).toBe(4);
    expect(i?.issue_type).toBe("task");
    expect(i?.labels).toEqual([]);
    expect(i?.dependencies).toEqual([]);
  });
});
