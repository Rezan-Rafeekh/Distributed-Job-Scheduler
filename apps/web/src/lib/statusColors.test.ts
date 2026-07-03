import { describe, expect, it } from "vitest";
import { statusColor, statusColors } from "./statusColors.js";

describe("statusColor", () => {
  it("returns the mapped classes for every known job/worker/dlq status", () => {
    for (const status of Object.keys(statusColors)) {
      const result = statusColor(status);
      expect(result.bg).toMatch(/^bg-/);
      expect(result.text).toMatch(/^text-/);
      expect(result.dot).toMatch(/^bg-/);
    }
  });

  it("falls back to the QUEUED palette for an unrecognized status", () => {
    expect(statusColor("SOME_UNKNOWN_STATUS")).toEqual(statusColors.QUEUED);
  });

  it("gives DEAD_LETTER and COMPLETED visually distinct treatments", () => {
    const dead = statusColor("DEAD_LETTER");
    const completed = statusColor("COMPLETED");
    expect(dead).not.toEqual(completed);
  });
});
