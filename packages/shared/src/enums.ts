export const OrgRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const JobType = {
  IMMEDIATE: "IMMEDIATE",
  DELAYED: "DELAYED",
  SCHEDULED: "SCHEDULED",
  RECURRING: "RECURRING",
  BATCH: "BATCH",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  SCHEDULED: "SCHEDULED",
  QUEUED: "QUEUED",
  CLAIMED: "CLAIMED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  DEAD_LETTER: "DEAD_LETTER",
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ExecutionStatus = {
  CLAIMED: "CLAIMED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const RetryStrategy = {
  FIXED: "FIXED",
  LINEAR: "LINEAR",
  EXPONENTIAL: "EXPONENTIAL",
} as const;
export type RetryStrategy = (typeof RetryStrategy)[keyof typeof RetryStrategy];

export const WorkerStatus = {
  ONLINE: "ONLINE",
  DRAINING: "DRAINING",
  OFFLINE: "OFFLINE",
} as const;
export type WorkerStatus = (typeof WorkerStatus)[keyof typeof WorkerStatus];

export const LogLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const DlqResolution = {
  PENDING: "PENDING",
  REQUEUED: "REQUEUED",
  DISCARDED: "DISCARDED",
} as const;
export type DlqResolution = (typeof DlqResolution)[keyof typeof DlqResolution];
