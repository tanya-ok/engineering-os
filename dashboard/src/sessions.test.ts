import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createApp } from "./server.js";
import { SessionPlans } from "./sessions.js";
import { IssueStore } from "./store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
it("persists and cancels plans without changing the selected repository", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "im-session-"));
  roots.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(["init"]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--allow-empty",
    "-m",
    "Fixture",
  ]);
  fs.writeFileSync(path.join(repo, "local.txt"), "existing work");
  const before = git(["status", "--porcelain"]);
  const dir = path.join(root, "sessions");
  const plans = new SessionPlans(dir, { sample: repo });
  expect(() => plans.create("../other", "task")).toThrow();
  expect(() => plans.create("sample", " ")).toThrow();
  const created = plans.create("sample", "Inspect tests");
  expect(created.status).toBe("awaiting_qualification");
  expect(created.dirty).toBe(true);
  const restored = new SessionPlans(dir, { sample: repo });
  expect(restored.list()).toHaveLength(1);
  expect(restored.cancel(created.id).status).toBe("cancelled");
  expect(() => restored.cancel("../outside")).toThrow();
  const fixture = path.join(import.meta.dirname, "../fixtures/beads.sample.jsonl");
  const app = createApp(
    new IssueStore({ kind: "jsonl", path: fixture }, 60000),
    root,
    { projects: {} },
    { bind: { host: "127.0.0.1", port: 8766 }, sessions: restored },
  );
  const base = "http://127.0.0.1:8766";
  const response = await app.request(`${base}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repository: "sample", task: "API plan" }),
  });
  expect(response.status).toBe(201);
  const row = (await response.json()) as { id: string };
  const cancel = await app.request(`${base}/api/sessions/${row.id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  expect(cancel.status).toBe(200);
  expect(git(["status", "--porcelain"])).toBe(before);
});

it("reads bounded qualification summaries without leaking extra report fields", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "im-qualification-report-"));
  roots.push(root);
  const plans = new SessionPlans(path.join(root, "sessions"), {});
  expect(plans.qualification()).toBeNull();
  const report = {
    checked_at: "2026-09-19T12:00:00Z",
    runtime_version: "1.18.31",
    runtime_compatible: true,
    model: "fixture-model",
    model_read_passed: false,
    isolation_passed: true,
    reason: "No answer",
    private_path: "/private/fixture",
  };
  const file = path.join(root, "qualification.json");
  fs.writeFileSync(file, JSON.stringify(report));
  expect(plans.qualification()?.model_read_passed).toBe(false);
  expect(JSON.stringify(plans.qualification())).not.toContain("private_path");
  fs.writeFileSync(file, JSON.stringify({ ...report, model_read_passed: "yes" }));
  expect(plans.qualification()).toBeNull();
});

it("skips unreadable session files instead of failing the list", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "im-session-list-"));
  roots.push(root);
  const dir = path.join(root, "sessions");
  fs.mkdirSync(dir);
  const good = {
    id: "00000000-0000-4000-8000-000000000001",
    repository: "sample",
    task: "Read",
    created_at: "2026-10-01T00:00:00Z",
    status: "cancelled",
    base_commit: "abc",
    dirty: false,
    reason: "Fixture",
  };
  fs.writeFileSync(path.join(dir, `${good.id}.json`), JSON.stringify(good));
  fs.writeFileSync(path.join(dir, "00000000-0000-4000-8000-000000000002.json"), "{truncated");
  fs.writeFileSync(path.join(dir, "00000000-0000-4000-8000-000000000003.json"), "null");
  fs.writeFileSync(path.join(dir, "00000000-0000-4000-8000-000000000004.json"), '{"id":"x"}');
  const plans = new SessionPlans(dir, {});
  expect(plans.list().map((s) => s.id)).toEqual([good.id]);
});
