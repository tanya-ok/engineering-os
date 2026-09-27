import { describe, expect, it } from "vitest";

import { formatAge } from "./format.js";

describe("formatAge", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");

  it("uses seconds, minutes, then hours", () => {
    expect(formatAge("2026-09-27T11:59:30Z", now)).toBe("30s ago");
    expect(formatAge("2026-09-27T11:55:00Z", now)).toBe("5 min ago");
    expect(formatAge("2026-09-27T09:00:00Z", now)).toBe("3 h ago");
  });

  it("clamps clock skew and reports unparseable input", () => {
    expect(formatAge("2026-09-27T12:00:05Z", now)).toBe("0s ago");
    expect(formatAge("not a date", now)).toBe("at an unknown time");
  });
});
