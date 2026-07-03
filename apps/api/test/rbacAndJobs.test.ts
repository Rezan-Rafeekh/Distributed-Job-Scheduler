import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@codity/db";
import { buildServer } from "../src/server.js";

async function registerAndLogin(app: FastifyInstance, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "password123", name: "Test User" },
  });
  return res.json().accessToken as string;
}

describe("RBAC + job lifecycle", () => {
  let app: FastifyInstance;
  const ownerEmail = `owner-${randomUUID()}@example.com`;
  const outsiderEmail = `outsider-${randomUUID()}@example.com`;
  let ownerToken: string;
  let outsiderToken: string;
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    ownerToken = await registerAndLogin(app, ownerEmail);
    outsiderToken = await registerAndLogin(app, outsiderEmail);

    const orgRes = await app.inject({
      method: "POST",
      url: "/api/orgs",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: `org-${randomUUID()}`, slug: `org-${randomUUID()}` },
    });
    orgId = orgRes.json().id;

    const projectRes = await app.inject({
      method: "POST",
      url: `/api/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "Test Project" },
    });
    projectId = projectRes.json().id;

    const queueRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/queues`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "test-queue", concurrencyLimit: 3 },
    });
    queueId = queueRes.json().id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, outsiderEmail] } } });
    await app.close();
  });

  it("denies a non-member access to the project with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("allows the owner to create and list jobs with cursor pagination", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/api/queues/${queueId}/jobs`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { type: "IMMEDIATE", payload: { i } },
      });
      expect(res.statusCode).toBe(201);
    }

    const page1 = await app.inject({
      method: "GET",
      url: `/api/queues/${queueId}/jobs?limit=2`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.pagination.hasMore).toBe(true);
    expect(body1.pagination.nextCursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/queues/${queueId}/jobs?limit=2&cursor=${body1.pagination.nextCursor}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const body2 = page2.json();
    const ids1 = new Set(body1.data.map((j: { id: string }) => j.id));
    const ids2 = new Set(body2.data.map((j: { id: string }) => j.id));
    expect([...ids1].some((id) => ids2.has(id))).toBe(false); // no overlap between pages
  });

  it("rejects job creation with an invalid payload with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/queues/${queueId}/jobs`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { type: "NOT_A_REAL_TYPE" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("requeues a dead-lettered job via the DLQ endpoint", async () => {
    const job = await prisma.job.create({
      data: {
        queueId,
        projectId,
        type: "IMMEDIATE",
        status: "DEAD_LETTER",
        payload: {},
        priority: 5,
        runAt: new Date(),
        maxAttempts: 1,
        attempts: 1,
      },
    });
    await prisma.deadLetterEntry.create({ data: { jobId: job.id, reason: "test failure" } });

    const res = await app.inject({
      method: "POST",
      url: `/api/dlq/${job.id}/requeue`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("QUEUED");

    const entry = await prisma.deadLetterEntry.findUniqueOrThrow({ where: { jobId: job.id } });
    expect(entry.resolvedStatus).toBe("REQUEUED");
  });
});
