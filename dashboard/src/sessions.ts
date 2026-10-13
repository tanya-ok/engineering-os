import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PlannedSession, QualificationStatus } from "./session-types.js";

export class SessionPlans {
  private readonly repos = new Map<string, string>();
  constructor(
    private readonly directory: string,
    repositories: Record<string, string>,
  ) {
    for (const [id, root] of Object.entries(repositories))
      this.repos.set(id, fs.realpathSync(root));
  }
  qualification(): QualificationStatus | null {
    try {
      const file = path.join(path.dirname(this.directory), "qualification.json");
      if (fs.statSync(file).size > 8192) return null;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw === null || typeof raw !== "object") return null;
      const strings = ["checked_at", "runtime_version", "model", "reason"] as const;
      if (strings.some((k) => typeof raw[k] !== "string" || raw[k].length > 1000)) return null;
      if (
        ["runtime_compatible", "model_read_passed", "isolation_passed"].some(
          (k) => typeof raw[k] !== "boolean",
        )
      )
        return null;
      return {
        checked_at: raw.checked_at,
        runtime_version: raw.runtime_version,
        runtime_compatible: raw.runtime_compatible,
        model: raw.model,
        model_read_passed: raw.model_read_passed,
        isolation_passed: raw.isolation_passed,
        reason: raw.reason,
      };
    } catch {
      return null;
    }
  }

  repositories(): string[] {
    return [...this.repos.keys()];
  }
  list(): PlannedSession[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs
      .readdirSync(this.directory)
      .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
      .flatMap((n) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(this.directory, n), "utf8"));
          const valid =
            raw !== null &&
            typeof raw === "object" &&
            typeof raw.id === "string" &&
            typeof raw.created_at === "string";
          return valid ? [raw as PlannedSession] : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  private save(session: PlannedSession): PlannedSession {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, `${session.id}.json`);
    const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, JSON.stringify(session, null, 2), { mode: 0o600, flag: "wx" });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return session;
  }
  create(repository: string, task: string): PlannedSession {
    const root = this.repos.get(repository);
    if (root === undefined) throw new Error("Repository is not configured");
    if (!task.trim() || task.length > 4000) throw new Error("Task must contain 1-4000 characters");
    const git = (args: string[]) =>
      execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    if (fs.realpathSync(git(["rev-parse", "--show-toplevel"])) !== root)
      throw new Error("Select a repository root");
    return this.save({
      id: randomUUID(),
      repository,
      task: task.trim(),
      created_at: new Date().toISOString(),
      base_commit: git(["rev-parse", "HEAD"]),
      dirty: git(["status", "--porcelain"]).length > 0,
      status: "awaiting_qualification",
      reason:
        "Execution is disabled until a model and isolated runner pass qualification. No worktree or agent has been started.",
    });
  }
  cancel(id: string): PlannedSession {
    const session = this.list().find((s) => s.id === id);
    if (!session) throw new Error("Session not found");
    return this.save({
      ...session,
      status: "cancelled",
      reason: "Plan cancelled; no agent was started.",
    });
  }
}
