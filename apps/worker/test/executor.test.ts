import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimJobs } from "@codity/db";
import { executeJob } from "../src/executor.js";

describe("executeJob lifecycle", () => {
  const db = new PrismaClient();
  let projectId: string;
  let queueId: string;
  const workerId = `test-worker-${randomUUID()}`;

  beforeAll(async () => {
    const org = await db.organization.create({ data: { name: `org-${randomUUID()}`, slug: `org-${randomUUID()}` } });
    const project = await db.project.create({ data: { organizationId: org.id, name: `proj-${randomUUID()}` } });
    projectId = project.id;
    const queue = await db.queue.create({ data: { projectId, name: `q-${randomUUID()}`, concurrencyLimit: 5 } });
    queueId = queue.id;
  });

  afterAll(async () => {
    const queue = await db.queue.findUnique({ where: { id: queueId }, select: { projectId: true } });
    if (queue) {
      const project = await db.project.findUnique({ where: { id: queue.projectId }, select: { organizationId: true } });
      if (project) await db.organization.delete({ where: { id: project.organizationId } });
    }
    await db.$disconnect();
  });

  async function createAndClaim(overrides: Partial<{ maxAttempts: number; payload: object }> = {}) {
    await db.job.create({
      data: {
        queueId,
        projectId,
        type: "IMMEDIATE",
        status: "QUEUED",
        payload: overrides.payload ?? { handler: "echo" },
        priority: 5,
        runAt: new Date(),
        maxAttempts: overrides.maxAttempts ?? 5,
      },
    });
    const [claimed] = await claimJobs(db, queueId, 1, workerId);
    return claimed!;
  }

  it("marks a successful job COMPLETED with a COMPLETED execution row", async () => {
    const job = await createAndClaim();
    await executeJob(db, workerId, job);

    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).not.toBeNull();

    const executions = await db.jobExecution.findMany({ where: { jobId: job.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0]!.status).toBe("COMPLETED");
  });

  it("schedules a retry on failure when attempts remain", async () => {
    const job = await createAndClaim({ maxAttempts: 3, payload: { handler: "fail-always" } });
    await executeJob(db, workerId, job);

    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SCHEDULED");
    expect(updated.attempts).toBe(1);
    expect(updated.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(updated.lastError).toMatch(/deliberate failure/);
  });

  it("moves to DEAD_LETTER once maxAttempts is exhausted", async () => {
    const job = await createAndClaim({ maxAttempts: 1, payload: { handler: "fail-always" } });
    await executeJob(db, workerId, job);

    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("DEAD_LETTER");

    const dlq = await db.deadLetterEntry.findUnique({ where: { jobId: job.id } });
    expect(dlq).not.toBeNull();
    expect(dlq!.reason).toMatch(/MAX_ATTEMPTS_EXCEEDED/);
  });

  it("does not crash when a manually-requeued job is dead-lettered a second time", async () => {
    const job = await createAndClaim({ maxAttempts: 1, payload: { handler: "fail-always" } });
    await executeJob(db, workerId, job);
    const firstDlq = await db.deadLetterEntry.findUniqueOrThrow({ where: { jobId: job.id } });

    // Simulate the manual DLQ requeue endpoint: back to QUEUED, claim, fail again.
    await db.job.update({ where: { id: job.id }, data: { status: "QUEUED", claimedBy: null, claimedAt: null } });
    const [reclaimed] = await claimJobs(db, queueId, 1, workerId);
    await expect(executeJob(db, workerId, reclaimed!)).resolves.not.toThrow();

    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("DEAD_LETTER");

    // Same DeadLetterEntry row, updated in place (not a duplicate / crash on the unique jobId constraint).
    const secondDlq = await db.deadLetterEntry.findUniqueOrThrow({ where: { jobId: job.id } });
    expect(secondDlq.id).toBe(firstDlq.id);
    expect(secondDlq.resolvedStatus).toBe("PENDING");
  });
});
