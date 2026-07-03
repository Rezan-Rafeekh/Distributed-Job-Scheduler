import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@codity/db";
import {
  JobStatus,
  JobType,
  canTransition,
  type CreateBatchJobInput,
  type CreateJobInput,
  type JobListQuery,
} from "@codity/shared";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { toCursorPage } from "../lib/pagination.js";
import { getQueue } from "./queueService.js";

async function resolveRetryPolicy(queueId: string, override: CreateJobInput["retryPolicy"]) {
  if (override) {
    const policy = await prisma.retryPolicy.create({ data: override });
    return policy;
  }
  const queue = await prisma.queue.findUnique({ where: { id: queueId }, include: { defaultRetryPolicy: true } });
  return queue?.defaultRetryPolicy ?? null;
}

export async function createJob(queueId: string, input: CreateJobInput) {
  const queue = await getQueue(queueId);
  const retryPolicy = await resolveRetryPolicy(queueId, input.retryPolicy);

  let status: JobStatus = JobStatus.QUEUED;
  let runAt = new Date();
  if (input.type === JobType.DELAYED) {
    runAt = new Date(Date.now() + input.delayMs);
    status = JobStatus.SCHEDULED;
  } else if (input.type === JobType.SCHEDULED) {
    runAt = input.runAt;
    status = runAt <= new Date() ? JobStatus.QUEUED : JobStatus.SCHEDULED;
  }

  const dependsOnJobIds = input.dependsOnJobIds ?? [];
  if (dependsOnJobIds.length > 0) {
    // A job with unmet dependencies is just another reason it isn't claimable
    // yet -- reuse SCHEDULED rather than invent a new state. promoteScheduledJobs
    // only promotes once run_at has passed AND every dependency is COMPLETED,
    // so this job waits on whichever of (runAt, dependencies) resolves last.
    const existingCount = await prisma.job.count({ where: { id: { in: dependsOnJobIds } } });
    if (existingCount !== dependsOnJobIds.length) {
      throw new ValidationError("One or more dependsOnJobIds do not exist");
    }
    status = JobStatus.SCHEDULED;
  }

  if (input.idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: { queueId_idempotencyKey: { queueId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          queueId,
          projectId: queue.projectId,
          type: input.type,
          status,
          payload: input.payload as Prisma.InputJsonValue,
          priority: input.priority,
          runAt,
          maxAttempts: input.maxAttempts ?? retryPolicy?.maxAttempts ?? 5,
          retryPolicyId: retryPolicy?.id,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (dependsOnJobIds.length > 0) {
        await tx.jobDependency.createMany({
          data: dependsOnJobIds.map((dependsOnJobId) => ({ jobId: job.id, dependsOnJobId })),
        });
      }

      return job;
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") {
      throw new ConflictError("A job with this idempotency key already exists in this queue");
    }
    throw err;
  }
}

export async function getJobDependencies(jobId: string) {
  await getJob(jobId);
  const [dependencies, dependents] = await Promise.all([
    prisma.jobDependency.findMany({ where: { jobId }, include: { dependsOnJob: true } }),
    prisma.jobDependency.findMany({ where: { dependsOnJobId: jobId }, include: { job: true } }),
  ]);
  return {
    dependencies: dependencies.map((d) => d.dependsOnJob),
    dependents: dependents.map((d) => d.job),
  };
}

export async function createBatch(queueId: string, input: CreateBatchJobInput) {
  const queue = await getQueue(queueId);
  const retryPolicy = await resolveRetryPolicy(queueId, input.retryPolicy);
  const batchId = randomUUID();
  const now = new Date();

  await prisma.job.createMany({
    data: input.jobs.map((job) => ({
      queueId,
      projectId: queue.projectId,
      type: JobType.BATCH,
      status: JobStatus.QUEUED,
      payload: job.payload as Prisma.InputJsonValue,
      priority: input.priority,
      runAt: now,
      maxAttempts: input.maxAttempts ?? retryPolicy?.maxAttempts ?? 5,
      retryPolicyId: retryPolicy?.id,
      batchId,
    })),
  });

  return { batchId, count: input.jobs.length };
}

export async function listJobsGlobal(projectId: string, query: JobListQuery) {
  const rows = await prisma.job.findMany({
    where: {
      projectId,
      status: query.status ? (query.status as JobStatus) : undefined,
      type: query.type ? (query.type as JobType) : undefined,
      queueId: query.queueId,
      ...(query.cursor ? { sequence: { lt: BigInt(query.cursor) } } : {}),
    },
    orderBy: { sequence: "desc" },
    take: query.limit + 1,
  });

  return toCursorPage(
    rows.map((row) => ({ ...row, cursorValue: row.sequence.toString() })),
    query.limit,
  );
}

export async function listJobsForQueue(queueId: string, query: JobListQuery) {
  const rows = await prisma.job.findMany({
    where: {
      queueId,
      status: query.status ? (query.status as JobStatus) : undefined,
      type: query.type ? (query.type as JobType) : undefined,
      ...(query.cursor ? { sequence: { lt: BigInt(query.cursor) } } : {}),
    },
    orderBy: { sequence: "desc" },
    take: query.limit + 1,
  });

  return toCursorPage(
    rows.map((row) => ({ ...row, cursorValue: row.sequence.toString() })),
    query.limit,
  );
}

export async function getJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { dlqEntry: true } });
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

export async function getJobExecutions(jobId: string) {
  await getJob(jobId);
  return prisma.jobExecution.findMany({ where: { jobId }, orderBy: { attemptNumber: "asc" } });
}

export async function getExecutionLogs(jobId: string, executionId: string) {
  const execution = await prisma.jobExecution.findFirst({ where: { id: executionId, jobId } });
  if (!execution) throw new NotFoundError("Execution not found");
  return prisma.jobLog.findMany({ where: { jobExecutionId: executionId }, orderBy: { timestamp: "asc" } });
}

export async function cancelJob(jobId: string) {
  const job = await getJob(jobId);
  if (!canTransition(job.status as JobStatus, JobStatus.CANCELLED)) {
    throw new ValidationError(`Cannot cancel a job in status ${job.status}`);
  }
  return prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.CANCELLED } });
}

/** Manually requeues a job (from DEAD_LETTER or otherwise), bypassing remaining maxAttempts for one more cycle. */
export async function retryJob(jobId: string) {
  const job = await getJob(jobId);
  if (job.status !== JobStatus.DEAD_LETTER) {
    throw new ValidationError("Only dead-lettered jobs can be manually retried via this endpoint");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({
      where: { id: jobId },
      data: { status: JobStatus.QUEUED, runAt: new Date(), claimedBy: null, claimedAt: null, lastError: null },
    });
    await tx.deadLetterEntry.update({
      where: { jobId },
      data: { resolvedStatus: "REQUEUED", resolvedAt: new Date() },
    });
    return updated;
  });
}
