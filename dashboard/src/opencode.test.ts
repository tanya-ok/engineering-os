import { afterEach, expect, it, vi } from "vitest";
import { OpenCodeAdapter } from "./opencode.js";

afterEach(() => vi.restoreAllMocks());
const paths = Object.fromEntries(
  [
    ["/session", ["get", "post"]],
    ["/session/{sessionID}/prompt_async", ["post"]],
    ["/session/{sessionID}/abort", ["post"]],
    ["/session/{sessionID}/diff", ["get"]],
  ].map(([route, methods]) => [
    route,
    Object.fromEntries((methods as string[]).map((m) => [m, {}])),
  ]),
);
function runtime(version = "1.18.31", contract = paths) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    expect(options?.redirect).toBe("error");
    expect(new Headers(options?.headers).get("Authorization")).toMatch(/^Basic /);
    const route = String(url);
    const body = route.endsWith("/global/health")
      ? { healthy: true, version }
      : route.endsWith("/doc")
        ? { openapi: "3.1.0", paths: contract }
        : route.endsWith("/abort")
          ? true
          : [];
    return new Response(JSON.stringify(body));
  });
}
const client = () => new OpenCodeAdapter("http://127.0.0.1:18769", "synthetic-password", "1.18.31");
it("validates the version and API before reading a diff or aborting", async () => {
  const fetch = runtime();
  expect((await client().inspect()).compatible).toBe(true);
  expect(await client().diff("ses_fixture")).toEqual([]);
  await client().abort("ses_fixture");
  expect(fetch.mock.calls.at(-1)?.[1]?.method).toBe("POST");
});
it("refuses a changed version and never sends abort", async () => {
  const fetch = runtime("2.0.0");
  await expect(client().abort("ses_fixture")).rejects.toThrow("compatibility");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("refuses incomplete contracts and traversal ids", async () => {
  runtime("1.18.31", {});
  expect((await client().inspect()).compatible).toBe(false);
  await expect(client().diff("../other")).rejects.toThrow("Invalid session");
});
it("rejects remote, credential-bearing and ambiguous endpoints", () => {
  for (const url of [
    "https://example.test",
    "http://localhost",
    "http://127.0.0.1/private",
    "http://user@127.0.0.1",
  ])
    expect(() => new OpenCodeAdapter(url, "x", "1")).toThrow();
});
it("does not expose transport errors or credentials", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("synthetic-password internal path"));
  const result = await client().inspect();
  expect(result.compatible).toBe(false);
  expect(JSON.stringify(result)).not.toContain("synthetic-password");
});
