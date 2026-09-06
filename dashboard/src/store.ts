// Cached issue set with a time-to-live. Reloads lazily; a failed reload keeps
// the last good data and surfaces the error through /api/health.

import { describeSource, loadIssues, type Source } from "./beads.js";
import type { Issue } from "./types.js";

export class IssueStore {
  private issues: Issue[] = [];
  private loadedAt = 0;
  private pending: Promise<Issue[]> | undefined;
  private error: string | undefined;

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

  async get(fresh = false): Promise<Issue[]> {
    const stale = Date.now() - this.loadedAt > this.ttlMs;
    if (!fresh && !stale && this.loadedAt !== 0) return this.issues;
    if (this.pending === undefined) {
      this.pending = loadIssues(this.source)
        .then((issues) => {
          this.issues = issues;
          this.loadedAt = Date.now();
          this.error = undefined;
          return issues;
        })
        .catch((e: unknown) => {
          this.error = (e as Error).message;
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
