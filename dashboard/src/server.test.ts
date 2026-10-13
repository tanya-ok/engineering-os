import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";
import { IssueStore } from "./store.js";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(PKG, "fixtures", "beads.sample.jsonl");
const PUBLIC = path.join(PKG, "public");
const BIND = { host: "127.0.0.1", port: 8766 };
const BASE = "http://127.0.0.1:8766";

function local(instance: Hono) {
  return {
    request: (p: string, init?: RequestInit) => instance.request(`${BASE}${p}`, init),
  };
}

function app() {
  const store = new IssueStore({ kind: "jsonl", path: FIXTURE }, 60_000);
  return local(
    createApp(
      store,
      PUBLIC,
      { projects: { "orchard-search": { label: "Orchard Search" } } },
      { bind: BIND },
    ),
  );
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
    expect(body).toEqual({ projects: { "orchard-search": { label: "Orchard Search" } } });
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
    const api = local(createApp(store, PUBLIC, { projects: {} }, { bind: BIND }));
    const health = await (await api.request("/api/health")).json();
    expect(health).toMatchObject({ status: "degraded", source: "jsonl" });
    expect(JSON.stringify(health)).not.toContain("/private");
    const response = await api.request("/api/issues");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("/private");
  });
});

it("blocks cross-site session mutations and disables fixture planning", async () => {
  const instance = app();
  const state = (await (await instance.request("/api/sessions")).json()) as {
    enabled: boolean;
    execution_enabled: boolean;
  };
  expect(state.enabled).toBe(false);
  expect(state.execution_enabled).toBe(false);
  expect(
    (
      await instance.request("/api/sessions", {
        method: "POST",
        headers: { origin: "https://external.example" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await instance.request("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "x".repeat(9000) }),
      })
    ).status,
  ).toBe(413);
});
it("reports source freshness without exposing filesystem locations", async () => {
  const response = (await (await app().request("/api/sources")).json()) as {
    sources: { count: number; last_read_at: string | null }[];
  };
  expect(response.sources[0]?.count).toBe(30);
  expect(response.sources[0]?.last_read_at).not.toBeNull();
  expect(JSON.stringify(response)).not.toContain(FIXTURE);
});

describe("local request guard", () => {
  const raw = () =>
    createApp(
      new IssueStore({ kind: "jsonl", path: FIXTURE }, 60_000),
      PUBLIC,
      { projects: {} },
      {
        bind: BIND,
      },
    );

  it("accepts loopback Host names on the bound port only", async () => {
    for (const host of ["127.0.0.1:8766", "localhost:8766", "[::1]:8766"]) {
      expect((await raw().request(`${BASE}/api/health`, { headers: { host } })).status).toBe(200);
    }
    for (const host of ["rebind.example:8766", "127.0.0.1:1234", "localhost"]) {
      expect((await raw().request(`${BASE}/api/issues`, { headers: { host } })).status).toBe(403);
      expect((await raw().request(`${BASE}/`, { headers: { host } })).status).toBe(403);
    }
  });

  it("compares Origin with the bound loopback origin, not the Host header", async () => {
    const post = (headers: Record<string, string>) =>
      raw().request(`${BASE}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
      });
    expect((await post({ origin: "http://rebind.example:8766" })).status).toBe(403);
    expect((await post({ host: "localhost:8766", origin: "http://attacker.example" })).status).toBe(
      403,
    );
    expect((await post({ "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await post({ origin: BASE })).status).toBe(503);
    expect((await post({ origin: "http://localhost:8766", host: "localhost:8766" })).status).toBe(
      503,
    );
  });

  it("requires JSON on POST", async () => {
    const res = await raw().request(`${BASE}/api/sessions/x/cancel`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    expect(res.status).toBe(415);
  });
});

describe("security headers", () => {
  it("sets CSP and hardening headers on pages, API and rejected requests", async () => {
    const page = await app().request("/");
    const api = await app().request("/api/health");
    const rejected = await app().request("/api/health", { headers: { host: "rebind.example" } });
    for (const res of [page, api, rejected]) {
      expect(res.headers.get("content-security-policy")).toBe(
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      );
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("strict-transport-security")).toBeNull();
    }
    expect(rejected.status).toBe(403);
  });
});

describe("issue detail state", () => {
  it("reports readiness and marks dependencies missing from the source", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-dash-"));
    const file = path.join(dir, "beads.jsonl");
    const rows = [
      { id: "p-epic", title: "epic", issue_type: "epic", dependencies: [] },
      {
        id: "p-blocker",
        title: "blocker",
        dependencies: [],
      },
      {
        id: "p-parent",
        title: "parent",
        dependencies: [{ issue_id: "p-parent", depends_on_id: "p-blocker", type: "blocks" }],
      },
      {
        id: "p-child",
        title: "child",
        dependencies: [
          { issue_id: "p-child", depends_on_id: "p-parent", type: "parent-child" },
          { issue_id: "p-child", depends_on_id: "external:other:cap", type: "blocks" },
        ],
      },
    ];
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n"));
    try {
      const store = new IssueStore({ kind: "jsonl", path: file }, 60_000);
      const res = await local(createApp(store, PUBLIC, { projects: {} }, { bind: BIND })).request(
        "/api/issues/p-child",
      );
      const body = (await res.json()) as {
        state: { ready: boolean; open_blockers: number; parent_blocked: boolean };
        dependencies: { id: string; missing: boolean }[];
      };
      expect(body.state).toEqual({ ready: false, open_blockers: 1, parent_blocked: true });
      expect(body.dependencies).toEqual([
        expect.objectContaining({ id: "p-parent", missing: false }),
        expect.objectContaining({ id: "external:other:cap", missing: true }),
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
