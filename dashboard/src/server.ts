// HTTP layer: a small JSON API over the issue store plus the static browser
// app. Binds 127.0.0.1 unless told otherwise; nothing here is meant for the
// open internet.

import fs from "node:fs";
import path from "node:path";

import { serve as honoServe } from "@hono/node-server";
import { type Context, Hono } from "hono";

import type { PublicConfig } from "./config.js";
import { buildGraph, readyQueue, summarizeProjects } from "./graph.js";
import type { IssueStore } from "./store.js";
import type { Issue } from "./types.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

class BadRequest extends Error {}

function boolParam(v: string | undefined, fallback: boolean, name: string): boolean {
  if (v === undefined) return fallback;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  throw new BadRequest(`'${name}' must be 1/0 or true/false`);
}

function listParam(v: string | undefined): string[] | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function filterIssues(issues: Issue[], q: Record<string, string | undefined>): Issue[] {
  const includeClosed = boolParam(q.include_closed, false, "include_closed");
  const projects = listParam(q.project);
  const statuses = listParam(q.status);
  const types = listParam(q.type);
  const labels = listParam(q.label);
  const text = q.q?.trim().toLowerCase();
  return issues.filter((i) => {
    if (!includeClosed && i.status === "closed" && !statuses?.includes("closed")) return false;
    if (projects !== undefined && !projects.includes(i.project)) return false;
    if (statuses !== undefined && !statuses.includes(i.status)) return false;
    if (types !== undefined && !types.includes(i.issue_type)) return false;
    if (labels !== undefined && !labels.every((l) => i.labels.includes(l))) return false;
    if (text !== undefined && text !== "") {
      const hay = `${i.id} ${i.title} ${i.labels.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

async function withIssues(
  c: Context,
  store: IssueStore,
  fn: (issues: Issue[]) => Response | Promise<Response>,
): Promise<Response> {
  let issues: Issue[];
  try {
    issues = await store.get(boolParam(c.req.query("fresh"), false, "fresh"));
  } catch (e) {
    if (e instanceof BadRequest) return c.text(e.message, 400);
    return c.text(`issue source failed: ${(e as Error).message}`, 503);
  }
  try {
    return await fn(issues);
  } catch (e) {
    if (e instanceof BadRequest) return c.text(e.message, 400);
    throw e;
  }
}

export function createApp(store: IssueStore, publicDir: string, config: PublicConfig): Hono {
  const app = new Hono();
  const root = path.resolve(publicDir);

  app.get("/api/health", async (c) => {
    let count = 0;
    let projects = 0;
    try {
      const issues = await store.get();
      count = issues.length;
      projects = summarizeProjects(issues).length;
    } catch {
      // reported through last_error below
    }
    const error = store.lastError;
    return c.json({
      status: error === undefined ? "ok" : "degraded",
      source: store.sourceLabel,
      issues: count,
      projects,
      loaded_at: store.loadedAtIso ?? null,
      last_error: error ?? null,
    });
  });

  app.get("/api/config", (c) => c.json(config));

  app.get("/api/issues", (c) =>
    withIssues(c, store, (issues) => c.json({ issues: filterIssues(issues, c.req.query()) })),
  );

  app.get("/api/issues/:id", (c) =>
    withIssues(c, store, (issues) => {
      const id = c.req.param("id");
      const issue = issues.find((i) => i.id === id);
      if (issue === undefined) return c.text(`no issue ${id}`, 404);
      const dependents = issues
        .filter((i) => i.dependencies.some((d) => d.to === id))
        .map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          type: i.dependencies.find((d) => d.to === id)?.type ?? "blocks",
        }));
      const dependencies = issue.dependencies.map((d) => {
        const dep = issues.find((i) => i.id === d.to);
        return { id: d.to, type: d.type, title: dep?.title ?? null, status: dep?.status ?? null };
      });
      return c.json({ issue, dependencies, dependents });
    }),
  );

  app.get("/api/projects", (c) =>
    withIssues(c, store, (issues) => c.json({ projects: summarizeProjects(issues) })),
  );

  app.get("/api/ready", (c) =>
    withIssues(c, store, (issues) => {
      const projects = listParam(c.req.query("project"));
      const ready = readyQueue(issues).filter(
        (i) => projects === undefined || projects.includes(i.project),
      );
      return c.json({ ready });
    }),
  );

  app.get("/api/graph", (c) =>
    withIssues(c, store, (issues) => {
      const q = c.req.query();
      const graph = buildGraph(issues, {
        includeClosed: boolParam(q.include_closed, false, "include_closed"),
        membership: boolParam(q.membership, true, "membership"),
        projects: listParam(q.project),
      });
      return c.json(graph);
    }),
  );

  // Static files: only what sits directly under publicDir; no traversal.
  app.get("/*", (c) => {
    let reqPath: string;
    try {
      reqPath = decodeURIComponent(c.req.path);
    } catch {
      return c.notFound();
    }
    if (reqPath === "/") reqPath = "/index.html";
    const abs = path.resolve(root, `.${reqPath}`);
    if (!abs.startsWith(root + path.sep)) return c.notFound();
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return c.notFound();
    const type = MIME[path.extname(abs)] ?? "application/octet-stream";
    return c.body(fs.readFileSync(abs), 200, { "Content-Type": type, "Cache-Control": "no-store" });
  });

  return app;
}

export function startServer(app: Hono, host: string, port: number): void {
  honoServe({ fetch: app.fetch, hostname: host, port }, () => {
    console.log(`eos-dashboard serving on http://${host}:${port}`);
  });
}
