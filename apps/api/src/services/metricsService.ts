import { Prisma, prisma } from "@codity/db";

interface ThroughputBucket {
  bucket: Date;
  completed: bigint;
  failed: bigint;
}

export async function getThroughput(projectId: string, hours = 24) {
  const rows = await prisma.$queryRaw<ThroughputBucket[]>(Prisma.sql`
    SELECT
      date_trunc('hour', je.finished_at) AS bucket,
      count(*) FILTER (WHERE je.status = 'COMPLETED') AS completed,
      count(*) FILTER (WHERE je.status = 'FAILED') AS failed
    FROM job_executions je
    JOIN jobs j ON j.id = je.job_id
    WHERE j.project_id = ${projectId}
      AND je.finished_at >= now() - (${hours}::text || ' hours')::interval
    GROUP BY 1
    ORDER BY 1 ASC;
  `);

  return rows.map((row) => ({
    bucket: row.bucket,
    completed: Number(row.completed),
    failed: Number(row.failed),
  }));
}

export async function getHealth(projectId: string) {
  const [queueCounts, workerCounts, dlqPending] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    prisma.worker.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.deadLetterEntry.count({ where: { resolvedStatus: "PENDING", job: { projectId } } }),
  ]);

  return {
    jobsByStatus: Object.fromEntries(queueCounts.map((r) => [r.status, r._count._all])),
    workersByStatus: Object.fromEntries(workerCounts.map((r) => [r.status, r._count._all])),
    dlqPending,
  };
}
