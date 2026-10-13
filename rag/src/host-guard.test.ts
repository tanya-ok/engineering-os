import { describe, expect, it } from "vitest";

import { allowedHosts, checkBind, envFlag } from "./host-guard.js";

describe("bind policy", () => {
  it("allows loopback hosts without a warning", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
      expect(checkBind(host, false)).toBeUndefined();
    }
  });

  it("refuses non-loopback hosts unless remote is allowed", () => {
    expect(() => checkBind("0.0.0.0", false)).toThrow(/--allow-remote/);
    expect(() => checkBind("192.0.2.10", false)).toThrow(/non-loopback/);
    expect(checkBind("0.0.0.0", true)).toMatch(/^warning:/);
  });

  it("parses env flags strictly", () => {
    expect(envFlag("1")).toBe(true);
    expect(envFlag("true")).toBe(true);
    expect(envFlag("yes")).toBe(false);
    expect(envFlag(undefined)).toBe(false);
  });

  it("adds a specific remote bind address but never a wildcard", () => {
    expect(allowedHosts({ host: "0.0.0.0", port: 1 })).toEqual(
      new Set(["127.0.0.1:1", "localhost:1", "[::1]:1"]),
    );
    expect(allowedHosts({ host: "192.0.2.10", port: 1 }).has("192.0.2.10:1")).toBe(true);
    expect(allowedHosts({ host: "fd00::1", port: 1 }).has("[fd00::1]:1")).toBe(true);
  });
});
