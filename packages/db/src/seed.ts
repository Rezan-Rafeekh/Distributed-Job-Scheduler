import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

/** A completed job with a realistic single-attempt execution + log history, for the job explorer, throughput chart, and execution history views. */
async function seedCompletedJob(opts: {
  queueId: string;
  projectId: string;
  payload: Record<string, unknown>;
  finishedAt: Date;
  durationMs?: number;
  retryPolicyId?: string;
  priority?: number;
  scheduledJobId?: string;
  type?: "IMMEDIATE" | "RECURRING" | "BATCH";
  batchId?: string;
}) {
  const durationMs = opts.durationMs ?? 120 + Math.floor(Math.random() * 900);
  const startedAt = new Date(opts.finishedAt.getTime() - durationMs);
  const job = await prisma.job.create({
    data: {
      queueId: opts.queueId,
      projectId: opts.projectId,
      type: opts.type ?? "IMMEDIATE",
      status: "COMPLETED",
      payload: opts.payload as Prisma.InputJsonValue,
      priority: opts.priority ?? 5,
      runAt: startedAt,
      attempts: 1,
      maxAttempts: 5,
      retryPolicyId: opts.retryPolicyId,
      scheduledJobId: opts.scheduledJobId,
      batchId: opts.batchId,
      startedAt,
      completedAt: opts.finishedAt,
      result: { ok: true } as Prisma.InputJsonValue,
      createdAt: new Date(startedAt.getTime() - 2000),
    },
  });
  const execution = await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      attemptNumber: 1,
      workerId: `seed-worker-${randomUUID().slice(0, 8)}`,
      status: "COMPLETED",
      claimedAt: startedAt,
      startedAt,
      finishedAt: opts.finishedAt,
      durationMs,
      result: { ok: true } as Prisma.InputJsonValue,
    },
  });
  await prisma.jobLog.createMany({
    data: [
      { jobExecutionId: execution.id, timestamp: startedAt, level: "INFO", message: `handler "${opts.payload.handler ?? "echo"}" started` },
      { jobExecutionId: execution.id, timestamp: opts.finishedAt, level: "INFO", message: "handler completed successfully" },
    ],
  });
  return job;
}

/** A dead-lettered job with a full multi-attempt failure history, matching exactly what executor.ts produces for a real fail-always run. */
async function seedDeadLetterJob(opts: {
  queueId: string;
  projectId: string;
  payload: Record<string, unknown>;
  maxAttempts: number;
  movedAt: Date;
  retryPolicyId?: string;
  aiSummary?: { summary: string; likelyCause: string; suggestedFix: string; severity: "low" | "medium" | "high" };
}) {
  const errorMessage = "fail-always handler: deliberate failure for testing retry/DLQ paths";
  const createdAt = new Date(opts.movedAt.getTime() - opts.maxAttempts * 45_000 - 5000);
  const job = await prisma.job.create({
    data: {
      queueId: opts.queueId,
      projectId: opts.projectId,
      type: "IMMEDIATE",
      status: "DEAD_LETTER",
      payload: opts.payload as Prisma.InputJsonValue,
      priority: 5,
      runAt: createdAt,
      attempts: opts.maxAttempts,
      maxAttempts: opts.maxAttempts,
      retryPolicyId: opts.retryPolicyId,
      lastError: errorMessage,
      createdAt,
    },
  });

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const attemptStart = new Date(opts.movedAt.getTime() - (opts.maxAttempts - attempt) * 45_000 - 400);
    const attemptEnd = new Date(attemptStart.getTime() + 180);
    const execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        attemptNumber: attempt,
        workerId: `seed-worker-${randomUUID().slice(0, 8)}`,
        status: "FAILED",
        claimedAt: attemptStart,
        startedAt: attemptStart,
        finishedAt: attemptEnd,
        durationMs: 180,
        error: errorMessage,
        errorStack: `Error: ${errorMessage}\n    at Object.fail-always (apps/worker/src/handlers/index.ts:31:11)`,
      },
    });
    await prisma.jobLog.createMany({
      data: [
        { jobExecutionId: execution.id, timestamp: attemptStart, level: "INFO", message: `attempt ${attempt} started` },
        { jobExecutionId: execution.id, timestamp: attemptEnd, level: "ERROR", message: errorMessage },
      ],
    });
  }

  await prisma.deadLetterEntry.create({
    data: {
      jobId: job.id,
      reason: `MAX_ATTEMPTS_EXCEEDED: ${errorMessage}`,
      movedAt: opts.movedAt,
      aiSummary: opts.aiSummary as unknown as Prisma.InputJsonValue,
      aiSummaryGeneratedAt: opts.aiSummary ? opts.movedAt : undefined,
    },
  });
  return job;
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // --- Org, users, RBAC roles -----------------------------------------------
  const owner = await prisma.user.upsert({
    where: { email: "demo@codity.dev" },
    update: {},
    create: { email: "demo@codity.dev", passwordHash, name: "Demo Owner" },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@codity.dev" },
    update: {},
    create: { email: "admin@codity.dev", passwordHash, name: "Ada Admin" },
  });
  const member = await prisma.user.upsert({
    where: { email: "member@codity.dev" },
    update: {},
    create: { email: "member@codity.dev", passwordHash, name: "Max Member" },
  });
  const viewer = await prisma.user.upsert({
    where: { email: "viewer@codity.dev" },
    update: {},
    create: { email: "viewer@codity.dev", passwordHash, name: "Vera Viewer" },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: { name: "Demo Org", slug: "demo-org" },
  });

  for (const [user, role] of [
    [owner, "OWNER"],
    [admin, "ADMIN"],
    [member, "MEMBER"],
    [viewer, "VIEWER"],
  ] as const) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role },
      create: { organizationId: org.id, userId: user.id, role },
    });
  }

  const project = await prisma.project.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Demo Project" } },
    update: {},
    create: { organizationId: org.id, name: "Demo Project", description: "Seeded project showcasing every feature" },
  });
  const marketingProject = await prisma.project.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Marketing Automation" } },
    update: {},
    create: { organizationId: org.id, name: "Marketing Automation", description: "A second project, to demonstrate multi-project navigation" },
  });

  // --- Clean slate for re-runs: wipe only this seed's own demo content -------
  // Cascades (see schema.prisma) take care of jobs/executions/logs/dlq/dependencies.
  await prisma.queue.deleteMany({ where: { projectId: { in: [project.id, marketingProject.id] } } });
  await prisma.retryPolicy.deleteMany({ where: { name: { in: ["default-exponential", "fixed-retry", "linear-backoff"] } } });
  await prisma.worker.deleteMany({ where: { hostname: { startsWith: "seed-worker-" } } });

  const exponentialRetry = await prisma.retryPolicy.create({
    data: { name: "default-exponential", strategy: "EXPONENTIAL", baseDelayMs: 1000, maxDelayMs: 60_000, maxAttempts: 5, jitter: true },
  });
  const fixedRetry = await prisma.retryPolicy.create({
    data: { name: "fixed-retry", strategy: "FIXED", baseDelayMs: 5000, maxAttempts: 3, jitter: false },
  });
  const linearRetry = await prisma.retryPolicy.create({
    data: { name: "linear-backoff", strategy: "LINEAR", baseDelayMs: 2000, maxDelayMs: 30_000, maxAttempts: 4, jitter: true },
  });

  // --- Queues ----------------------------------------------------------------
  const emails = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "emails",
      description: "Outbound transactional emails",
      concurrencyLimit: 5,
      defaultRetryPolicyId: exponentialRetry.id,
    },
  });
  const reports = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "reports",
      description: "Scheduled and recurring report generation",
      concurrencyLimit: 3,
      defaultRetryPolicyId: fixedRetry.id,
    },
  });
  const webhooks = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "webhooks",
      description: "Outbound webhook delivery — paused so the demo backlog stays visible; try resuming it",
      concurrencyLimit: 10,
      isPaused: true,
      defaultRetryPolicyId: fixedRetry.id,
    },
  });
  const imageProcessing = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "image-processing",
      description: "Batch thumbnail generation",
      concurrencyLimit: 4,
      defaultRetryPolicyId: linearRetry.id,
    },
  });
  const campaigns = await prisma.queue.create({
    data: { projectId: marketingProject.id, name: "campaigns", description: "Marketing campaign sends", concurrencyLimit: 5, defaultRetryPolicyId: exponentialRetry.id },
  });

  // --- emails: live queue + 24h throughput history + retries + DLQ + delayed -
  await prisma.job.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      queueId: emails.id,
      projectId: project.id,
      type: "IMMEDIATE" as const,
      status: "QUEUED" as const,
      payload: { handler: "echo", to: `user${i}@example.com`, template: "welcome" },
      priority: i % 3,
      runAt: new Date(),
      maxAttempts: exponentialRetry.maxAttempts,
      retryPolicyId: exponentialRetry.id,
    })),
  });

  for (let i = 0; i < 16; i++) {
    await seedCompletedJob({
      queueId: emails.id,
      projectId: project.id,
      payload: { handler: i % 4 === 0 ? "sleep" : "echo", to: `user${i}@example.com`, template: "welcome" },
      finishedAt: hoursAgo(Math.random() * 24),
      retryPolicyId: exponentialRetry.id,
      priority: i % 3,
    });
  }

  await seedDeadLetterJob({
    queueId: emails.id,
    projectId: project.id,
    payload: { handler: "fail-always", to: "bounce@example.com", template: "invoice" },
    maxAttempts: 2,
    movedAt: hoursAgo(3),
    retryPolicyId: exponentialRetry.id,
    aiSummary: {
      summary:
        "This job used the synthetic 'fail-always' test handler, which unconditionally throws on every attempt regardless of payload. It exhausted its 2-attempt retry budget and moved to the dead letter queue exactly as designed.",
      likelyCause: "Handler-level test fixture: 'fail-always' intentionally raises on every invocation. This is not a transient error and would never succeed on retry.",
      suggestedFix: "This is expected test behavior, not a real incident — swap in the intended handler name, or discard this job if it was only created to exercise the DLQ path.",
      severity: "low",
    },
  });
  await seedDeadLetterJob({
    queueId: emails.id,
    projectId: project.id,
    payload: { handler: "fail-always", to: "unreachable@example.com", template: "password-reset" },
    maxAttempts: 3,
    movedAt: hoursAgo(9),
    retryPolicyId: exponentialRetry.id,
  });
  await seedDeadLetterJob({
    queueId: emails.id,
    projectId: project.id,
    payload: { handler: "fail-always", to: "spam-trap@example.com", template: "newsletter" },
    maxAttempts: 2,
    movedAt: hoursAgo(20),
    retryPolicyId: exponentialRetry.id,
  });

  await prisma.job.createMany({
    data: [
      { queueId: emails.id, projectId: project.id, type: "DELAYED", status: "SCHEDULED", payload: { handler: "echo", to: "later@example.com", template: "reminder" }, priority: 5, runAt: hoursFromNow(2), maxAttempts: 5, retryPolicyId: exponentialRetry.id },
      { queueId: emails.id, projectId: project.id, type: "DELAYED", status: "SCHEDULED", payload: { handler: "echo", to: "much-later@example.com", template: "follow-up" }, priority: 5, runAt: hoursFromNow(6), maxAttempts: 5, retryPolicyId: exponentialRetry.id },
    ],
  });

  // Dependency chain 2 (released live): A2 already COMPLETED, B2 SCHEDULED with
  // its dependency already satisfied -- promoteScheduledJobs will promote it to
  // QUEUED (and the live worker will then execute it) within moments of seeding.
  const depA2 = await seedCompletedJob({
    queueId: emails.id,
    projectId: project.id,
    payload: { handler: "echo", to: "chain@example.com", template: "export-ready" },
    finishedAt: minutesAgo(5),
    retryPolicyId: exponentialRetry.id,
  });
  const depB2 = await prisma.job.create({
    data: {
      queueId: emails.id,
      projectId: project.id,
      type: "IMMEDIATE",
      status: "SCHEDULED",
      payload: { handler: "echo", to: "chain@example.com", template: "export-notify" },
      priority: 5,
      runAt: minutesAgo(1),
      maxAttempts: 5,
      retryPolicyId: exponentialRetry.id,
    },
  });
  await prisma.jobDependency.create({ data: { jobId: depB2.id, dependsOnJobId: depA2.id } });

  // --- reports: SCHEDULED type, RECURRING template + history, dependency chain 3 (cascade-cancel, live within one reconciler tick)
  await prisma.job.create({
    data: {
      queueId: reports.id,
      projectId: project.id,
      type: "SCHEDULED",
      status: "SCHEDULED",
      payload: { handler: "echo", report: "monthly-revenue" },
      priority: 3,
      runAt: daysFromNow(3),
      maxAttempts: fixedRetry.maxAttempts,
      retryPolicyId: fixedRetry.id,
    },
  });

  const weeklyDigest = await prisma.scheduledJob.create({
    data: {
      queueId: reports.id,
      name: "weekly-report-digest",
      cronExpression: "0 8 * * MON",
      timezone: "UTC",
      payloadTemplate: { handler: "echo", report: "weekly-digest" },
      retryPolicyId: fixedRetry.id,
      maxAttempts: fixedRetry.maxAttempts,
      nextRunAt: hoursFromNow(36),
    },
  });
  for (let i = 0; i < 3; i++) {
    await seedCompletedJob({
      queueId: reports.id,
      projectId: project.id,
      payload: { handler: "echo", report: "weekly-digest" },
      finishedAt: hoursAgo(24 * 7 * (i + 1)),
      retryPolicyId: fixedRetry.id,
      type: "RECURRING",
      scheduledJobId: weeklyDigest.id,
    });
  }

  const depA3 = await seedDeadLetterJob({
    queueId: reports.id,
    projectId: project.id,
    payload: { handler: "fail-always", report: "quarterly-forecast" },
    maxAttempts: 1,
    movedAt: minutesAgo(2),
    retryPolicyId: fixedRetry.id,
  });
  const depB3 = await prisma.job.create({
    data: {
      queueId: reports.id,
      projectId: project.id,
      type: "IMMEDIATE",
      status: "SCHEDULED",
      payload: { handler: "echo", report: "quarterly-forecast-email" },
      priority: 5,
      runAt: minutesAgo(1),
      maxAttempts: 5,
      retryPolicyId: fixedRetry.id,
    },
  });
  await prisma.jobDependency.create({ data: { jobId: depB3.id, dependsOnJobId: depA3.id } });

  // --- webhooks (paused): dependency chain 1 (permanently blocked, stable demo) + a visible backlog
  const depA1 = await prisma.job.create({
    data: {
      queueId: webhooks.id,
      projectId: project.id,
      type: "IMMEDIATE",
      status: "QUEUED",
      payload: { handler: "echo", url: "https://example.com/hooks/order-created" },
      priority: 5,
      runAt: minutesAgo(10),
      maxAttempts: fixedRetry.maxAttempts,
      retryPolicyId: fixedRetry.id,
    },
  });
  const depB1 = await prisma.job.create({
    data: {
      queueId: webhooks.id,
      projectId: project.id,
      type: "IMMEDIATE",
      status: "SCHEDULED",
      payload: { handler: "echo", url: "https://example.com/hooks/order-confirmed" },
      priority: 5,
      runAt: minutesAgo(9),
      maxAttempts: fixedRetry.maxAttempts,
      retryPolicyId: fixedRetry.id,
    },
  });
  await prisma.jobDependency.create({ data: { jobId: depB1.id, dependsOnJobId: depA1.id } });

  await prisma.job.createMany({
    data: Array.from({ length: 4 }, (_, i) => ({
      queueId: webhooks.id,
      projectId: project.id,
      type: "IMMEDIATE" as const,
      status: "QUEUED" as const,
      payload: { handler: "echo", url: `https://example.com/hooks/event-${i}` },
      priority: 5,
      runAt: minutesAgo(8 - i),
      maxAttempts: fixedRetry.maxAttempts,
      retryPolicyId: fixedRetry.id,
    })),
  });

  // --- image-processing: a batch mid-flight (mixed statuses under one batchId)
  const batchId = randomUUID();
  for (let i = 0; i < 3; i++) {
    await seedCompletedJob({
      queueId: imageProcessing.id,
      projectId: project.id,
      payload: { handler: "sleep", ms: 400, assetId: `asset-${i}` },
      finishedAt: minutesAgo(30 - i * 5),
      retryPolicyId: linearRetry.id,
      type: "BATCH",
      batchId,
    });
  }
  await seedDeadLetterJob({
    queueId: imageProcessing.id,
    projectId: project.id,
    payload: { handler: "fail-always", assetId: "asset-corrupt" },
    maxAttempts: 4,
    movedAt: minutesAgo(20),
    retryPolicyId: linearRetry.id,
  });
  await prisma.job.createMany({
    data: Array.from({ length: 2 }, (_, i) => ({
      queueId: imageProcessing.id,
      projectId: project.id,
      type: "BATCH" as const,
      status: "QUEUED" as const,
      payload: { handler: "sleep", ms: 500, assetId: `asset-pending-${i}` },
      priority: 5,
      runAt: new Date(),
      maxAttempts: linearRetry.maxAttempts,
      retryPolicyId: linearRetry.id,
      batchId,
    })),
  });

  // --- second project: proves multi-project navigation works end to end -----
  await prisma.job.createMany({
    data: Array.from({ length: 2 }, (_, i) => ({
      queueId: campaigns.id,
      projectId: marketingProject.id,
      type: "IMMEDIATE" as const,
      status: "QUEUED" as const,
      payload: { handler: "echo", campaign: `spring-sale-${i}` },
      priority: 5,
      runAt: new Date(),
      maxAttempts: exponentialRetry.maxAttempts,
      retryPolicyId: exponentialRetry.id,
    })),
  });
  for (let i = 0; i < 3; i++) {
    await seedCompletedJob({
      queueId: campaigns.id,
      projectId: marketingProject.id,
      payload: { handler: "echo", campaign: `welcome-series-${i}` },
      finishedAt: hoursAgo(Math.random() * 12),
      retryPolicyId: exponentialRetry.id,
    });
  }

  // --- extra workers for a fuller Workers page / Pipeline view ---------------
  // Never touches the real worker row created at process startup (different hostname prefix).
  await prisma.worker.create({
    data: {
      hostname: "seed-worker-eu-west-2b",
      pid: 42101,
      status: "DRAINING",
      concurrency: 8,
      currentJobCount: 3,
      startedAt: hoursAgo(5),
      lastHeartbeatAt: new Date(),
    },
  });
  await prisma.worker.create({
    data: {
      hostname: "seed-worker-legacy-01",
      pid: 18823,
      status: "OFFLINE",
      concurrency: 5,
      currentJobCount: 0,
      startedAt: hoursAgo(72),
      lastHeartbeatAt: hoursAgo(48),
    },
  });

  console.log("Seed complete.");
  console.log("Log in as any of:");
  console.log("  demo@codity.dev   / password123  (OWNER)");
  console.log("  admin@codity.dev  / password123  (ADMIN)");
  console.log("  member@codity.dev / password123  (MEMBER)");
  console.log("  viewer@codity.dev / password123  (VIEWER)");
  console.log(`Org: ${org.name} (${org.slug}) — projects: "${project.name}", "${marketingProject.name}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
