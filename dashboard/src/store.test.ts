import { afterEach, expect, it, vi } from "vitest";
import { loadIssues } from "./beads.js";
import { IssueStore } from "./store.js";

vi.mock("./beads.js", () => ({ loadIssues: vi.fn(), describeSource: () => "fixture" }));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("keeps cached data and backs off even for forced refreshes after lock contention", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  const loader = vi.mocked(loadIssues);
  loader
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("locked"))
    .mockResolvedValueOnce([]);
  const store = new IssueStore({ kind: "jsonl", path: "unused" }, 1);
  await store.get();
  vi.advanceTimersByTime(10);
  expect(await store.get()).toEqual([]);
  expect(store.lastError).toBe("locked");
  await Promise.all([store.get(true), store.get(true)]);
  expect(loader).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(15_000);
  await store.get();
  expect(loader).toHaveBeenCalledTimes(3);
  expect(store.lastError).toBeUndefined();
});
it("reports an initial failure instead of inventing empty healthy data", async () => {
  vi.useFakeTimers();
  vi.mocked(loadIssues).mockRejectedValue(new Error("locked"));
  const store = new IssueStore({ kind: "jsonl", path: "unused" }, 1);
  await expect(store.get()).rejects.toThrow("locked");
  await expect(store.get(true)).rejects.toThrow("locked");
  expect(loadIssues).toHaveBeenCalledTimes(1);
});
