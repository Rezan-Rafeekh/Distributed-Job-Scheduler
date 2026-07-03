import { describe, expect, it } from "vitest";
import { canTransition, assertTransition, isTerminal } from "../src/stateMachine.js";
import { JobStatus } from "../src/enums.js";

const ALL_STATUSES = Object.values(JobStatus);

const LEGAL_PAIRS: Array<[JobStatus, JobStatus]> = [
  [JobStatus.SCHEDULED, JobStatus.QUEUED],
  [JobStatus.SCHEDULED, JobStatus.CANCELLED],
  [JobStatus.QUEUED, JobStatus.CLAIMED],
  [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.CLAIMED, JobStatus.RUNNING],
  [JobStatus.CLAIMED, JobStatus.QUEUED],
  [JobStatus.CLAIMED, JobStatus.CANCELLED],
  [JobStatus.RUNNING, JobStatus.COMPLETED],
  [JobStatus.RUNNING, JobStatus.SCHEDULED],
  [JobStatus.RUNNING, JobStatus.QUEUED],
  [JobStatus.RUNNING, JobStatus.DEAD_LETTER],
  [JobStatus.DEAD_LETTER, JobStatus.QUEUED],
];

describe("canTransition", () => {
  it.each(LEGAL_PAIRS)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it("rejects every pair not explicitly whitelisted", () => {
    const legalSet = new Set(LEGAL_PAIRS.map(([f, t]) => `${f}->${t}`));
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        const key = `${from}->${to}`;
        expect(canTransition(from, to)).toBe(legalSet.has(key));
      }
    }
  });

  it("rejects transitions out of terminal states COMPLETED and CANCELLED", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition(JobStatus.COMPLETED, to)).toBe(false);
      expect(canTransition(JobStatus.CANCELLED, to)).toBe(false);
    }
  });
});

describe("assertTransition", () => {
  it("does not throw for legal transitions", () => {
    expect(() => assertTransition(JobStatus.QUEUED, JobStatus.CLAIMED)).not.toThrow();
  });

  it("throws for illegal transitions", () => {
    expect(() => assertTransition(JobStatus.COMPLETED, JobStatus.RUNNING)).toThrow(
      /Illegal job state transition/,
    );
  });
});

describe("isTerminal", () => {
  it("COMPLETED and CANCELLED are terminal", () => {
    expect(isTerminal(JobStatus.COMPLETED)).toBe(true);
    expect(isTerminal(JobStatus.CANCELLED)).toBe(true);
  });

  it("DEAD_LETTER is not terminal (requeueable)", () => {
    expect(isTerminal(JobStatus.DEAD_LETTER)).toBe(false);
  });

  it("QUEUED, CLAIMED, RUNNING, SCHEDULED are not terminal", () => {
    expect(isTerminal(JobStatus.QUEUED)).toBe(false);
    expect(isTerminal(JobStatus.CLAIMED)).toBe(false);
    expect(isTerminal(JobStatus.RUNNING)).toBe(false);
    expect(isTerminal(JobStatus.SCHEDULED)).toBe(false);
  });
});
