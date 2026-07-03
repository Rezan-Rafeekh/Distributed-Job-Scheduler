import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimJobs } from "../src/queries/claimJobs.js";

/**
 * Integration test against a real Postgres instance (see docker-compose.yml).
 * This is the single most important test in the repo: it proves the atomic
 * claim query never double-claims a job and never exceeds a queue's
 * concurrency limit, even under real concurrent callers.
 */
describe("claimJobs concurrency guarantees", () => {
  const db = new PrismaClient();
  let orgId: string;
  let projectId: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `test-org-${randomUUID()}`, slug: `test-org-${randomUUID()}` },
    });
    orgId = org.id;
    const project = await db.project.create({
      data: { organizationId: orgId, name: `test-project-${randomUUID()}` },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("never double-claims and never exceeds queue concurrency under concurrent callers", async () => {
    const concurrencyLimit = 10;
    const totalJobs = 40;
    const concurrentCallers = 8;
    const perCallerLimit = 5;

    const queue = await db.queue.create({
      data: {
        projectId,
        name: `test-queue-${randomUUID()}`,
        concurrencyLimit,
      },
    });

    await db.job.createMany({
      data: Array.from({ length: totalJobs }, () => ({
        queueId: queue.id,
        projectId,
        type: "IMMEDIATE" as const,
        status: "QUEUED" as const,
        payload: {},
        priority: 5,
        runAt: new Date(),
        maxAttempts: 5,
      })),
    });

    const results = await Promise.all(
      Array.from({ length: concurrentCallers }, (_, i) =>
        claimJobs(db, queue.id, perCallerLimit, `worker-${i}`),
      ),
    );

    const claimedIds = results.flat().map((j) => j.id);
    const uniqueIds = new Set(claimedIds);

    expect(uniqueIds.size).toBe(claimedIds.length); // no duplicate claims across callers
    expect(claimedIds.length).toBeLessThanOrEqual(concurrencyLimit); // never exceeds queue capacity

    const claimedCount = await db.job.count({
      where: { queueId: queue.id, status: "CLAIMED" },
    });
    expect(claimedCount).toBe(claimedIds.length);

    // A further claim call must return nothing once capacity is exhausted.
    const followUp = await claimJobs(db, queue.id, perCallerLimit, "worker-followup");
    expect(followUp).toHaveLength(0);

    await db.job.deleteMany({ where: { queueId: queue.id } });
    await db.queue.delete({ where: { id: queue.id } });
  });

  it("does not claim from a paused queue", async () => {
    const queue = await db.queue.create({
      data: { projectId, name: `paused-queue-${randomUUID()}`, concurrencyLimit: 5, isPaused: true },
    });
    await db.job.create({
      data: {
        queueId: queue.id,
        projectId,
        type: "IMMEDIATE",
        status: "QUEUED",
        payload: {},
        priority: 5,
        runAt: new Date(),
        maxAttempts: 5,
      },
    });

    const claimed = await claimJobs(db, queue.id, 5, "worker-x");
    expect(claimed).toHaveLength(0);

    await db.job.deleteMany({ where: { queueId: queue.id } });
    await db.queue.delete({ where: { id: queue.id } });
  });

  it("does not claim jobs whose run_at is in the future", async () => {
    const queue = await db.queue.create({
      data: { projectId, name: `future-queue-${randomUUID()}`, concurrencyLimit: 5 },
    });
    await db.job.create({
      data: {
        queueId: queue.id,
        projectId,
        type: "DELAYED",
        status: "QUEUED",
        payload: {},
        priority: 5,
        runAt: new Date(Date.now() + 60_000),
        maxAttempts: 5,
      },
    });

    const claimed = await claimJobs(db, queue.id, 5, "worker-y");
    expect(claimed).toHaveLength(0);

    await db.job.deleteMany({ where: { queueId: queue.id } });
    await db.queue.delete({ where: { id: queue.id } });
  });
});
