import { claimJobs, promoteScheduledJobs, type PrismaClient } from "@codity/db";
import { executeJob } from "./executor.js";
import { Semaphore } from "./semaphore.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

export class PollLoop {
  private timer: NodeJS.Timeout | undefined;
  private draining = false;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly semaphore: Semaphore;

  constructor(
    private readonly db: PrismaClient,
    private readonly workerId: string,
    concurrency = config.concurrency,
  ) {
    this.semaphore = new Semaphore(concurrency);
  }

  start(): void {
    this.tick();
  }

  /** Stops claiming new jobs; in-flight jobs are left to finish (see shutdown.ts for the grace/timeout logic). */
  drain(): void {
    this.draining = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async waitForInFlight(): Promise<void> {
    await Promise.all(this.inFlight);
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private tick = async (): Promise<void> => {
    if (this.draining) return;

    try {
      await promoteScheduledJobs(this.db);
      await this.claimAndDispatch();
    } catch (err) {
      logger.error({ err }, "poll loop tick failed");
    }

    if (!this.draining) {
      this.timer = setTimeout(this.tick, config.pollIntervalMs);
    }
  };

  private async claimAndDispatch(): Promise<void> {
    if (this.semaphore.freeSlots <= 0) return;

    const queues = await this.db.queue.findMany({
      where: { isPaused: false },
      select: { id: true, priority: true },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
    if (queues.length === 0) return;

    // Strict priority across tiers (lower Queue.priority = drained first, same
    // convention as Job.priority), fair split within a tier. Each tier only
    // sees whatever capacity the higher-priority tiers before it left behind,
    // so a busy high-priority queue can legitimately starve a lower-priority
    // one for a tick -- that's the point of "priority", not a bug.
    const tiers = new Map<number, string[]>();
    for (const queue of queues) {
      const bucket = tiers.get(queue.priority) ?? [];
      bucket.push(queue.id);
      tiers.set(queue.priority, bucket);
    }

    for (const [, queueIds] of [...tiers.entries()].sort(([a], [b]) => a - b)) {
      if (this.draining || this.semaphore.freeSlots <= 0) return;

      const perQueueLimit = Math.max(1, Math.floor(this.semaphore.freeSlots / queueIds.length));
      for (const queueId of queueIds) {
        if (this.draining) return;
        const claimed = await claimJobs(this.db, queueId, Math.min(perQueueLimit, this.semaphore.freeSlots), this.workerId);
        for (const job of claimed) {
          const release = await this.semaphore.acquire();
          const task = executeJob(this.db, this.workerId, job)
            .catch((err) => logger.error({ err, jobId: job.id }, "unhandled error executing job"))
            .finally(() => {
              release();
              this.inFlight.delete(task);
            });
          this.inFlight.add(task);
        }
      }
    }
  }
}
