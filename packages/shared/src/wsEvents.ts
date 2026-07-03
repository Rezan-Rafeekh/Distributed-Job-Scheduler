import { JobStatus, WorkerStatus } from "./enums.js";

export interface JobStatusChangedEvent {
  type: "job.status_changed";
  projectId: string;
  jobId: string;
  queueId: string;
  status: JobStatus;
  timestamp: string;
}

// Workers are global (not scoped to a single project — a worker polls across
// all unpaused queues it can see), so unlike job/queue events these carry no
// projectId; the web client subscribes to a global "workers" room instead.
export interface WorkerHeartbeatEvent {
  type: "worker.heartbeat";
  workerId: string;
  activeJobCount: number;
  timestamp: string;
}

export interface WorkerStatusChangedEvent {
  type: "worker.status_changed";
  workerId: string;
  status: WorkerStatus;
  timestamp: string;
}

export interface QueueStatsChangedEvent {
  type: "queue.stats_changed";
  projectId: string;
  queueId: string;
  timestamp: string;
}

export type WsEvent =
  | JobStatusChangedEvent
  | WorkerHeartbeatEvent
  | WorkerStatusChangedEvent
  | QueueStatsChangedEvent;

/** Postgres NOTIFY channel names used as the cross-process pub/sub backbone. */
export const NOTIFY_CHANNELS = {
  JOB_EVENTS: "job_events",
  WORKER_EVENTS: "worker_events",
  QUEUE_EVENTS: "queue_events",
} as const;
