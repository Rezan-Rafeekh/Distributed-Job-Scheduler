import { describe, expect, it } from "vitest";
import { computeRetryDelayMs, computeNextRunAt } from "../src/retry.js";
import { RetryStrategy } from "../src/enums.js";

const noJitter = (base: Partial<Parameters<typeof computeRetryDelayMs>[0]> = {}) => ({
  strategy: RetryStrategy.FIXED,
  baseDelayMs: 1000,
  jitter: false,
  ...base,
});

describe("computeRetryDelayMs", () => {
  it("FIXED returns a constant delay regardless of attempt", () => {
    const policy = noJitter({ strategy: RetryStrategy.FIXED, baseDelayMs: 2000 });
    expect(computeRetryDelayMs(policy, 1)).toBe(2000);
    expect(computeRetryDelayMs(policy, 5)).toBe(2000);
  });

  it("LINEAR scales delay by attempt number", () => {
    const policy = noJitter({ strategy: RetryStrategy.LINEAR, baseDelayMs: 1000 });
    expect(computeRetryDelayMs(policy, 1)).toBe(1000);
    expect(computeRetryDelayMs(policy, 2)).toBe(2000);
    expect(computeRetryDelayMs(policy, 4)).toBe(4000);
  });

  it("EXPONENTIAL doubles per attempt", () => {
    const policy = noJitter({ strategy: RetryStrategy.EXPONENTIAL, baseDelayMs: 100 });
    expect(computeRetryDelayMs(policy, 1)).toBe(100);
    expect(computeRetryDelayMs(policy, 2)).toBe(200);
    expect(computeRetryDelayMs(policy, 3)).toBe(400);
    expect(computeRetryDelayMs(policy, 5)).toBe(1600);
  });

  it("caps at maxDelayMs when provided", () => {
    const policy = noJitter({
      strategy: RetryStrategy.EXPONENTIAL,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
    });
    expect(computeRetryDelayMs(policy, 10)).toBe(5000);
  });

  it("applies jitter within [0.5, 1.0] of the computed delay", () => {
    const policy = { strategy: RetryStrategy.FIXED, baseDelayMs: 1000, jitter: true };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const delay = computeRetryDelayMs(policy, 1, () => r);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it("rejects attempt < 1", () => {
    expect(() => computeRetryDelayMs(noJitter(), 0)).toThrow(RangeError);
  });
});

describe("computeNextRunAt", () => {
  it("adds the computed delay to the given `now`", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const policy = noJitter({ strategy: RetryStrategy.FIXED, baseDelayMs: 5000 });
    const next = computeNextRunAt(policy, 1, now);
    expect(next.toISOString()).toBe("2026-01-01T00:00:05.000Z");
  });
});
