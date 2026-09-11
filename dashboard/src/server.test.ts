import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";
import { IssueStore } from "./store.js";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(PKG, "fixtures", "beads.sample.jsonl");
const PUBLIC = path.join(PKG, "public");

function app() {
  const store = new IssueStore({ kind: "jsonl", path: FIXTURE }, 60_000);
  return createApp(store, PUBLIC, { projects: { "harbor-gps": { label: "Harbor GPS" } } });
}

describe("api", () => {
  it("reports health with counts from the fixture", async () => {
    const res = await app().request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; issues: number; projects: number };
    expect(body.status).toBe("ok");
    expect(body.issues).toBe(30);
    expect(body.projects).toBe(3);
  });

  it("serves the public config only", async () => {
    const body = await (await app().request("/api/config")).json();
    expect(body).toEqual({ projects: { "harbor-gps": { label: "Harbor GPS" } } });
  });

  it("filters issues by project and hides closed ones by default", async () => {
    const res = await app().request("/api/issues?project=northwind-platform");
    const body = (await res.json()) as { issues: { id: string; status: string }[] };
    expect(body.issues.length).toBe(9);
    expect(body.issues.every((i) => i.id.startsWith("northwind-platform-"))).toBe(true);
    expect(body.issues.some((i) => i.status === "closed")).toBe(false);
  });

  it("includes closed issues when asked and rejects a bad flag", async () => {
    const ok = await app().request("/api/issues?project=northwind-platform&include_closed=1");
    expect(((await ok.json()) as { issues: unknown[] }).issues.length).toBe(10);
    const bad = await app().request("/api/issues?include_closed=maybe");
    expect(bad.status).toBe(400);
  });

  it("returns one issue with resolved dependencies and dependents", async () => {
    const res = await app().request("/api/issues/lighthouse-ops-t7u");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issue: { id: string };
      dependencies: unknown[];
      dependents: { id: string; type: string }[];
    };
    expect(body.issue.id).toBe("lighthouse-ops-t7u");
    expect(body.dependencies).toEqual([]);
    expect(body.dependents.map((d) => d.id).sort()).toEqual([
      "lighthouse-ops-p5q",
      "lighthouse-ops-r6s",
    ]);
    expect((await app().request("/api/issues/nope-1")).status).toBe(404);
  });

  it("builds the graph with project hubs and honours membership=0", async () => {
    const withHubs = (await (await app().request("/api/graph")).json()) as {
      nodes: { kind: string }[];
      edges: { type: string }[];
    };
    expect(withHubs.nodes.filter((n) => n.kind === "project")).toHaveLength(3);
    const plain = (await (await app().request("/api/graph?membership=0")).json()) as {
      nodes: { kind: string }[];
      edges: { type: string }[];
    };
    expect(plain.nodes.some((n) => n.kind === "project")).toBe(false);
    expect(plain.edges.some((e) => e.type === "member")).toBe(false);
  });

  it("lists the ready queue ordered by priority", async () => {
    const body = (await (await app().request("/api/ready")).json()) as {
      ready: { id: string; priority: number }[];
    };
    expect(body.ready.length).toBeGreaterThan(0);
    const priorities = body.ready.map((i) => i.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
    expect(body.ready.map((i) => i.id)).toContain("lighthouse-ops-t7u");
    expect(body.ready.map((i) => i.id)).not.toContain("lighthouse-ops-p5q");
  });
});

describe("static files", () => {
  it("serves the app shell at /", async () => {
    const res = await app().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('id="root"');
  });

  it("refuses paths outside the public directory", async () => {
    expect((await app().request("/../package.json")).status).toBe(404);
    expect((await app().request("/%2e%2e/package.json")).status).toBe(404);
    expect((await app().request("/missing.js")).status).toBe(404);
  });
});

describe("source privacy", () => {
  it("does not return source paths or filesystem errors", async () => {
    const store = new IssueStore({ kind: "jsonl", path: "/private/nonexistent/export.jsonl" }, 0);
    const api = createApp(store, PUBLIC, { projects: {} });
    const health = await (await api.request("/api/health")).json();
    expect(health).toMatchObject({ status: "degraded", source: "jsonl" });
    expect(JSON.stringify(health)).not.toContain("/private");
    const response = await api.request("/api/issues");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("/private");
  });
});
