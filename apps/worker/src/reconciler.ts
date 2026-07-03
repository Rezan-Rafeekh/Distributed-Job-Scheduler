import parser from "cron-parser";
import { Prisma, notify, WorkerStatus as PrismaWorkerStatus, type PrismaClient } from "@codity/db";
import { JobStatus, NOTIFY_CHANNELS, type WorkerStatusChangedEvent } from "@codity/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";

type Tx = Prisma.TransactionClient;

// Arbitrary fixed key for the single global reconciler lock; any stable
// constant works as long as it's not reused elsewhere.
const RECONCILER_LOCK_KEY = 727_001n;

/**
 * Leader-elected background loop: at most one worker process runs this at a
 * time, so cron materialization and dead-worker detection never double-fire
 * across a fleet of worker replicas. Cheap, non-time-sensitive maintenance
 * only -- SCHEDULED->QUEUED promotion runs separately in the poll loop since
 * it's both cheap and safe to run from every worker without leader election.
 */
export class Reconciler {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly db: PrismaClient) {}

  start(): void {
    this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private tick = async (): Promise<void> => {
    try {
      // pg_try_advisory_xact_lock, not pg_try_advisory_lock + a manual unlock
      // call. Session-scoped advisory locks are tied to whichever physical
      // connection acquired them, but Prisma's shared client pools
      // connections -- there is no guarantee the later `pg_advisory_unlock`
      // call lands on the *same* connection that took the lock. If it
      // doesn't, the lock never releases and every worker's reconciler is
      // silently blocked forever (this happened in practice: a worker was
      // force-killed mid-tick, its pooled connection stayed idle-but-open,
      // and the lock it held was never released). The transaction-scoped
      // variant is released automatically at commit/rollback, and
      // `$transaction(async (tx) => ...)` guarantees every statement in the
      // callback -- including the lock acquisition itself -- runs on one
      // held connection, so there's no cross-connection mismatch possible.
      await this.db.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<[{ locked: boolean }]>(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(${RECONCILER_LOCK_KEY}) AS locked`,
        );
        if (!locked) return;

        await this.materializeCronJobs(tx);
        await this.requeueStaleClaims(tx);
        await this.markDeadWorkers(tx);
        await this.cascadeCancelBlockedDependents(tx);
      });
    } catch (err) {
      logger.error({ err }, "reconciler tick failed");
    }

    if (!this.stopped) {
      this.timer = setTimeout(this.tick, config.reconcilerIntervalMs);
    }
  };

  private async materializeCronJobs(tx: Tx): Promise<void> {
    const due = await tx.scheduledJob.findMany({
      where: { isActive: true, nextRunAt: { lte: new Date() } },
    });

    for (const template of due) {
      const queue = await tx.queue.findUniqueOrThrow({ where: { id: template.queueId } });
      await tx.job.create({
        data: {
          queueId: template.queueId,
          projectId: queue.projectId,
          type: "RECURRING",
          status: JobStatus.QUEUED,
          payload: template.payloadTemplate as Prisma.InputJsonValue,
          priority: template.priority,
          runAt: template.nextRunAt,
          maxAttempts: template.maxAttempts,
          retryPolicyId: template.retryPolicyId,
          scheduledJobId: template.id,
        },
      });

      const interval = parser.parseExpression(template.cronExpression, {
        currentDate: template.nextRunAt,
        tz: template.timezone,
      });
      const nextRunAt = interval.next().toDate();

      await tx.scheduledJob.update({
        where: { id: template.id },
        data: { nextRunAt, lastMaterializedAt: new Date() },
      });
      logger.info({ scheduledJobId: template.id }, "materialized recurring job");
    }
  }

  /** Requeues jobs orphaned by a worker that died between CLAIMED/RUNNING and completion. */
  private async requeueStaleClaims(tx: Tx): Promise<void> {
    const deadThreshold = new Date(Date.now() - config.heartbeatIntervalMs * config.deadWorkerMultiplier);
    const staleWorkerIds = (
      await tx.worker.findMany({
        where: { status: { not: PrismaWorkerStatus.OFFLINE }, lastHeartbeatAt: { lt: deadThreshold } },
        select: { id: true },
      })
    ).map((w) => w.id);

    if (staleWorkerIds.length === 0) return;

    const result = await tx.job.updateMany({
      where: { claimedBy: { in: staleWorkerIds }, status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] } },
      data: { status: JobStatus.QUEUED, claimedBy: null, claimedAt: null },
    });
    if (result.count > 0) {
      logger.warn({ count: result.count, staleWorkerIds }, "requeued jobs orphaned by dead workers");
    }
  }

  private async markDeadWorkers(tx: Tx): Promise<void> {
    const deadThreshold = new Date(Date.now() - config.heartbeatIntervalMs * config.deadWorkerMultiplier);
    const staleWorkers = await tx.worker.findMany({
      where: { status: { not: PrismaWorkerStatus.OFFLINE }, lastHeartbeatAt: { lt: deadThreshold } },
      select: { id: true },
    });
    if (staleWorkers.length === 0) return;

    await tx.worker.updateMany({
      where: { id: { in: staleWorkers.map((w) => w.id) } },
      data: { status: PrismaWorkerStatus.OFFLINE },
    });

    for (const worker of staleWorkers) {
      const event: WorkerStatusChangedEvent = {
        type: "worker.status_changed",
        workerId: worker.id,
        status: "OFFLINE",
        timestamp: new Date().toISOString(),
      };
      // NOTIFY delivery is deferred until this transaction commits anyway,
      // so issuing it on `tx` (rather than the shared client) is correct,
      // not just convenient -- it only fires if the whole tick commits.
      await notify(tx, NOTIFY_CHANNELS.WORKER_EVENTS, event).catch((err) =>
        logger.warn({ err }, "failed to publish worker.status_changed event"),
      );
    }
    logger.warn({ count: staleWorkers.length }, "marked dead workers OFFLINE");
  }

  /**
   * A job waiting on a dependency that will never reach COMPLETED (it's been
   * dead-lettered or cancelled) would otherwise stay SCHEDULED forever with
   * no path forward. Cascade-cancel it instead of leaving it silently stuck.
   * SCHEDULED -> CANCELLED is already a legal transition (stateMachine.ts).
   *
   * Deliberate, documented scope boundary: if the dead-lettered dependency is
   * later manually requeued and goes on to succeed, this already-cancelled
   * dependent is NOT resurrected -- there is no cascade-requeue, only
   * cascade-cancel. A human who wants the dependent to run must recreate it.
   */
  private async cascadeCancelBlockedDependents(tx: Tx): Promise<void> {
    const result = await tx.$executeRaw(Prisma.sql`
      UPDATE jobs
      SET status = 'CANCELLED',
          last_error = 'Cancelled: a dependency was dead-lettered or cancelled and will never complete'
      WHERE status = 'SCHEDULED'
        AND EXISTS (
          SELECT 1 FROM job_dependencies jd
          JOIN jobs dep ON dep.id = jd.depends_on_job_id
          WHERE jd.job_id = jobs.id AND dep.status IN ('DEAD_LETTER', 'CANCELLED')
        )
    `);
    if (result > 0) {
      logger.warn({ count: result }, "cancelled jobs blocked on a permanently-failed dependency");
    }
  }
}
