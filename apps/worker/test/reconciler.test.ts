import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Reconciler } from "../src/reconciler.js";

/**
 * `tick` is intentionally private (see reconciler.ts) since nothing outside
 * the class should schedule it directly -- cast to reach it for a single
 * deterministic invocation instead of waiting on the class's own timer.
 */
type ReconcilerInternals = { tick: () => Promise<void> };

describe("Reconciler cascade-cancel for permanently-failed dependencies", () => {
  const db = new PrismaClient();
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `cascade-org-${randomUUID()}`, slug: `cascade-org-${randomUUID()}` },
    });
    orgId = org.id;
    const project = await db.project.create({
      data: { organizationId: orgId, name: `cascade-project-${randomUUID()}` },
    });
    projectId = project.id;
    const queue = await db.queue.create({
      data: { projectId, name: `cascade-queue-${randomUUID()}`, concurrencyLimit: 5 },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  async function createJob(status: "SCHEDULED" | "DEAD_LETTER" | "COMPLETED") {
    return db.job.create({
      data: {
        queueId,
        projectId,
        type: "IMMEDIATE",
        status,
        payload: {},
        priority: 5,
        runAt: new Date(Date.now() - 1000),
        maxAttempts: 1,
      },
    });
  }

  it("cancels a SCHEDULED job whose dependency is DEAD_LETTER, with a descriptive lastError", async () => {
    const deadEnd = await createJob("DEAD_LETTER");
    const blocked = await createJob("SCHEDULED");
    await db.jobDependency.create({ data: { jobId: blocked.id, dependsOnJobId: deadEnd.id } });

    const reconciler = new Reconciler(db);
    await (reconciler as unknown as ReconcilerInternals).tick();

    const updated = await db.job.findUniqueOrThrow({ where: { id: blocked.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.lastError).toMatch(/dependency was dead-lettered or cancelled/);
  });

  it("leaves a SCHEDULED job alone once its dependency reaches COMPLETED", async () => {
    const dependency = await createJob("COMPLETED");
    const dependent = await createJob("SCHEDULED");
    await db.jobDependency.create({ data: { jobId: dependent.id, dependsOnJobId: dependency.id } });

    const reconciler = new Reconciler(db);
    await (reconciler as unknown as ReconcilerInternals).tick();

    const updated = await db.job.findUniqueOrThrow({ where: { id: dependent.id } });
    expect(updated.status).toBe("SCHEDULED");
  });
});
