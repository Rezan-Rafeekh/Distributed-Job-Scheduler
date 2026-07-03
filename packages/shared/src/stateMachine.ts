import { JobStatus } from "./enums.js";

/**
 * Legal Job.status transitions. RUNNING -> SCHEDULED/QUEUED represents a retry
 * (the job is re-armed rather than resting in a terminal FAILED state — see
 * docs/design-decisions.md for why JobExecution carries the per-attempt failure).
 */
const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  [JobStatus.SCHEDULED]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.QUEUED]: [JobStatus.CLAIMED, JobStatus.CANCELLED],
  [JobStatus.CLAIMED]: [JobStatus.RUNNING, JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.RUNNING]: [
    JobStatus.COMPLETED,
    JobStatus.SCHEDULED,
    JobStatus.QUEUED,
    JobStatus.DEAD_LETTER,
  ],
  [JobStatus.COMPLETED]: [],
  [JobStatus.DEAD_LETTER]: [JobStatus.QUEUED],
  [JobStatus.CANCELLED]: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job state transition: ${from} -> ${to}`);
  }
}

export function isTerminal(status: JobStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
