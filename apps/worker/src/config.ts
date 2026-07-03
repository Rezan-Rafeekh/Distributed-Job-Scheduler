export const config = {
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1500),
  heartbeatIntervalMs: Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 5000),
  reconcilerIntervalMs: Number(process.env.WORKER_RECONCILER_INTERVAL_MS ?? 30_000),
  shutdownGraceMs: Number(process.env.WORKER_SHUTDOWN_GRACE_MS ?? 30_000),
  // A worker is considered dead once its heartbeat is older than this multiple
  // of the heartbeat interval. 3x tolerates a couple of missed beats before
  // acting, avoiding false positives from transient GC pauses / DB blips.
  deadWorkerMultiplier: 3,
} as const;
