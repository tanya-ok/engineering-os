// Cached issue set with a time-to-live. Reloads lazily; a failed reload keeps
// the last good data and surfaces the error through /api/health.

import fs from "node:fs";
import { describeSource, loadIssues, type Source } from "./beads.js";
import type { SourceStatus } from "./source-status.js";
import type { Issue } from "./types.js";
import { readTracker } from "./work-items.js";

export class IssueStore {
  private issues: Issue[] = [];
  private loadedAt = 0;
  private pending: Promise<Issue[]> | undefined;
  private error: string | undefined;
  private retryAfter = 0;
  private attempted: string | null = null;
  private snapshot: string | null = null;
  private snapshots = new Map<string, Issue[]>();
  private statuses = new Map<string, SourceStatus>();

  private async load(): Promise<Issue[]> {
    if (this.source.kind !== "portfolio") return loadIssues(this.source);
    let failures = 0;
    await Promise.all(
      this.source.sources.map(async (source) => {
        const id = JSON.stringify([source.source_id, source.repository_id]);
        const previous = this.statuses.get(id);
        const now = new Date().toISOString();
        const state: SourceStatus = {
          id,
          label: source.label ?? `${source.source_id} / ${source.repository_id}`,
          kind: source.source.kind,
          last_attempt_at: now,
          last_read_at: previous?.last_read_at ?? null,
          snapshot_at: previous?.snapshot_at ?? null,
          count: previous?.count ?? null,
          error: null,
          graph_loaded_at: previous?.graph_loaded_at ?? null,
          stale: false,
        };
        try {
          const issues = await readTracker(source);
          this.snapshots.set(id, issues);
          state.last_read_at = now;
          state.graph_loaded_at = now;
          state.count = issues.length;
          if (source.source.kind !== "bd")
            state.snapshot_at = fs.statSync(source.source.path).mtime.toISOString();
        } catch {
          failures += 1;
          state.error = "Source unavailable; last good data retained when available.";
          state.stale = true;
        }
        this.statuses.set(id, state);
      }),
    );
    if (failures) {
      this.error = "Some portfolio sources unavailable";
      this.retryAfter = Date.now() + 15_000;
      if (!this.snapshots.size) throw new Error(this.error);
    }
    const all = [...this.snapshots.values()].flat();
    const known = new Set(all.map((item) => item.id));
    for (const state of this.statuses.values()) state.unresolved_edges = 0;
    return all.map((item) => ({
      ...item,
      dependencies: item.dependencies.map((dependency) => {
        const unresolved = !known.has(dependency.to);
        const meta = item.work_item;
        const state = meta
          ? this.statuses.get(JSON.stringify([meta.source_id, meta.repository_id]))
          : undefined;
        if (unresolved && state) state.unresolved_edges = (state.unresolved_edges ?? 0) + 1;
        return { ...dependency, unresolved };
      }),
    }));
  }

  constructor(
    readonly source: Source,
    private readonly ttlMs: number,
  ) {}

  get sourceLabel(): string {
    return describeSource(this.source);
  }

  get loadedAtIso(): string | undefined {
    return this.loadedAt === 0 ? undefined : new Date(this.loadedAt).toISOString();
  }

  get lastError(): string | undefined {
    return this.error;
  }

  sourceStatus(): SourceStatus[] {
    if (this.source.kind === "portfolio")
      return [...this.statuses.values()].map((s) => ({
        ...s,
        stale:
          s.error !== null ||
          s.last_read_at === null ||
          Date.now() - Date.parse(s.last_read_at) > this.ttlMs,
      }));
    return [
      {
        id: "source-1",
        label: "Configured tracker",
        kind: this.source.kind,
        last_attempt_at: this.attempted,
        last_read_at: this.loadedAtIso ?? null,
        snapshot_at: this.snapshot,
        count: this.loadedAt ? this.issues.length : null,
        error: this.error ? "Source unavailable; check local configuration." : null,
        graph_loaded_at: this.loadedAtIso ?? null,
        stale:
          this.error !== undefined || !this.loadedAt || Date.now() - this.loadedAt > this.ttlMs,
      },
    ];
  }
  async get(fresh = false): Promise<Issue[]> {
    if (this.error !== undefined && Date.now() < this.retryAfter) {
      if (this.loadedAt) return this.issues;
      throw new Error(this.error);
    }
    const stale = Date.now() - this.loadedAt > this.ttlMs;
    if (!fresh && !stale && this.loadedAt !== 0) return this.issues;
    if (this.pending === undefined) {
      this.attempted = new Date().toISOString();
      this.error = undefined;
      this.pending = this.load()
        .then((issues) => {
          this.issues = issues;
          this.loadedAt = Date.now();
          if (!this.error) this.retryAfter = 0;
          if (this.source.kind === "jsonl") {
            try {
              this.snapshot = fs.statSync(this.source.path).mtime.toISOString();
            } catch {
              this.snapshot = null;
            }
          }
          return issues;
        })
        .catch((e: unknown) => {
          this.error = (e as Error).message;
          this.retryAfter = Date.now() + 15_000;
          if (this.loadedAt === 0) throw e;
          return this.issues;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }
}
