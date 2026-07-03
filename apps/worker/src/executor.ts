import { notify, type ClaimedJob, type PrismaClient } from "@codity/db";
import {
  JobStatus,
  ExecutionStatus,
  RetryStrategy,
  computeNextRunAt,
  NOTIFY_CHANNELS,
  type JobStatusChangedEvent,
} from "@codity/shared";
import { resolveHandler } from "./handlers/index.js";
import { logger } from "./logger.js";

async function publishJobStatusChanged(
  db: PrismaClient,
  job: Pick<ClaimedJob, "id" | "queueId" | "projectId">,
  status: JobStatus,
): Promise<void> {
  const event: JobStatusChangedEvent = {
    type: "job.status_changed",
    projectId: job.projectId,
    jobId: job.id,
    queueId: job.queueId,
    status,
    timestamp: new Date().toISOString(),
  };
  try {
    await notify(db, NOTIFY_CHANNELS.JOB_EVENTS, event);
  } catch (err) {
    // Live-update delivery is best-effort; never let a NOTIFY failure fail the job.
    logger.warn({ err, jobId: job.id }, "failed to publish job.status_changed event");
  }
}

/**
 * Executes a single previously-claimed job end to end: marks RUNNING, creates
 * the per-attempt JobExecution audit row, runs the registered handler, then
 * finalizes the job per the state machine (COMPLETED, retried, or DEAD_LETTER).
 */
export async function executeJob(db: PrismaClient, workerId: string, job: ClaimedJob): Promise<void> {
  const attemptNumber = job.attempts + 1;
  const startedAt = new Date();

  await db.job.update({
    where: { id: job.id },
    data: { status: JobStatus.RUNNING, startedAt, attempts: attemptNumber },
  });
  await publishJobStatusChanged(db, job, JobStatus.RUNNING);

  const execution = await db.jobExecution.create({
    data: {
      jobId: job.id,
      attemptNumber,
      workerId,
      status: ExecutionStatus.RUNNING,
      claimedAt: job.claimedAt ?? startedAt,
      startedAt,
    },
  });

  const logBuffer: Array<{ level: "DEBUG" | "INFO" | "WARN" | "ERROR"; message: string; metadata?: unknown }> = [];
  const ctx = {
    jobId: job.id,
    attempt: attemptNumber,
    log: (level: "debug" | "info" | "warn" | "error", message: string, metadata?: unknown) => {
      logBuffer.push({ level: level.toUpperCase() as "DEBUG" | "INFO" | "WARN" | "ERROR", message, metadata });
    },
  };

  let result: unknown;
  let error: Error | undefined;
  try {
    const handler = resolveHandler((job.payload as Record<string, unknown>) ?? {});
    result = await handler((job.payload as Record<string, unknown>) ?? {}, ctx);
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  if (logBuffer.length > 0) {
    await db.jobLog.createMany({
      data: logBuffer.map((entry) => ({
        jobExecutionId: execution.id,
        level: entry.level,
        message: entry.message,
        metadata: entry.metadata === undefined ? undefined : (entry.metadata as object),
      })),
    });
  }

  if (!error) {
    await db.jobExecution.update({
      where: { id: execution.id },
      data: { status: ExecutionStatus.COMPLETED, finishedAt, durationMs, result: result as object },
    });
    await db.job.update({
      where: { id: job.id },
      data: { status: JobStatus.COMPLETED, completedAt: finishedAt, result: result as object, lastError: null },
    });
    await publishJobStatusChanged(db, job, JobStatus.COMPLETED);
    return;
  }

  await db.jobExecution.update({
    where: { id: execution.id },
    data: {
      status: ExecutionStatus.FAILED,
      finishedAt,
      durationMs,
      error: error.message,
      errorStack: error.stack,
    },
  });

  if (attemptNumber < job.maxAttempts) {
    const retryPolicy = job.retryPolicyId
      ? await db.retryPolicy.findUnique({ where: { id: job.retryPolicyId } })
      : null;
    const nextRunAt = computeNextRunAt(
      {
        strategy: (retryPolicy?.strategy as RetryStrategy) ?? RetryStrategy.EXPONENTIAL,
        baseDelayMs: retryPolicy?.baseDelayMs ?? 1000,
        maxDelayMs: retryPolicy?.maxDelayMs ?? undefined,
        jitter: retryPolicy?.jitter ?? true,
      },
      attemptNumber,
    );

    await db.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.SCHEDULED,
        runAt: nextRunAt,
        lastError: error.message,
        claimedBy: null,
        claimedAt: null,
      },
    });
    await publishJobStatusChanged(db, job, JobStatus.SCHEDULED);
    logger.info({ jobId: job.id, attemptNumber, nextRunAt }, "job failed, scheduled for retry");
    return;
  }

  const reason = `MAX_ATTEMPTS_EXCEEDED: ${error.message}`;
  await db.$transaction([
    db.job.update({
      where: { id: job.id },
      data: { status: JobStatus.DEAD_LETTER, lastError: error.message, claimedBy: null },
    }),
    // A job can be dead-lettered, manually requeued (see jobService.retryJob),
    // and then exhaust its retries again -- DeadLetterEntry.jobId is unique,
    // so this must be an upsert, not a create, or the second dead-letter
    // cycle for the same job crashes on the unique constraint.
    db.deadLetterEntry.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, reason },
      update: { reason, movedAt: new Date(), resolvedStatus: "PENDING", resolvedAt: null, resolvedByUserId: null },
    }),
  ]);
  await publishJobStatusChanged(db, job, JobStatus.DEAD_LETTER);
  logger.warn({ jobId: job.id, attemptNumber }, "job exhausted retries, moved to dead letter queue");
}
