import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { promoteScheduledJobs } from "../src/queries/promoteScheduledJobs.js";

/**
 * Confirms the workflow-dependency gate on promoteScheduledJobs (the sole
 * enforcement point -- claimJobs.ts is untouched): a job with an unsatisfied
 * dependency must never promote to QUEUED, and must promote within one tick
 * of its dependency reaching the genuinely-terminal COMPLETED state.
 */
describe("promoteScheduledJobs dependency gating", () => {
  const db = new PrismaClient();
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `dep-org-${randomUUID()}`, slug: `dep-org-${randomUUID()}` },
    });
    orgId = org.id;
    const project = await db.project.create({
      data: { organizationId: orgId, name: `dep-project-${randomUUID()}` },
    });
    projectId = project.id;
    const queue = await db.queue.create({
      data: { projectId, name: `dep-queue-${randomUUID()}`, concurrencyLimit: 5 },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  async function createJob(status: "SCHEDULED" | "QUEUED" | "COMPLETED" | "DEAD_LETTER" | "CANCELLED") {
    return db.job.create({
      data: {
        queueId,
        projectId,
        type: "IMMEDIATE",
        status,
        payload: {},
        priority: 5,
        runAt: new Date(Date.now() - 1000),
        maxAttempts: 5,
      },
    });
  }

  it("keeps a job SCHEDULED while its dependency is incomplete, then promotes it once satisfied", async () => {
    const jobA = await createJob("QUEUED");
    const jobB = await createJob("SCHEDULED");
    await db.jobDependency.create({ data: { jobId: jobB.id, dependsOnJobId: jobA.id } });

    await promoteScheduledJobs(db);
    const stillWaiting = await db.job.findUniqueOrThrow({ where: { id: jobB.id } });
    expect(stillWaiting.status).toBe("SCHEDULED");

    await db.job.update({ where: { id: jobA.id }, data: { status: "COMPLETED", completedAt: new Date() } });

    await promoteScheduledJobs(db);
    const released = await db.job.findUniqueOrThrow({ where: { id: jobB.id } });
    expect(released.status).toBe("QUEUED");
  });

  it("promotes a dependency-free SCHEDULED job normally", async () => {
    const job = await createJob("SCHEDULED");
    await promoteScheduledJobs(db);
    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
  });
});
