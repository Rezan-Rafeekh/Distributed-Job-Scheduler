import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Promotes due SCHEDULED jobs (delayed/scheduled/retry-armed) to QUEUED so the
 * claim query only ever has to look at one status. Idempotent UPDATE — safe
 * to run from every worker on every poll tick with no leader election, unlike
 * cron materialization or dead-worker detection which must run once.
 *
 * Also the sole enforcement point for workflow dependencies (bonus feature):
 * a job with any unsatisfied dependency (a JobDependency row pointing at a
 * job that hasn't reached COMPLETED) is excluded from promotion, so it's
 * never a candidate for the claim query -- claimJobs.ts needs no changes at
 * all. Since COMPLETED is a genuinely terminal state (see stateMachine.ts),
 * this NOT EXISTS check can never flip back to "unsatisfied" once satisfied,
 * so there's no re-promotion race to guard against.
 */
export async function promoteScheduledJobs(db: PrismaClient): Promise<number> {
  const result = await db.$executeRaw(Prisma.sql`
    UPDATE jobs
    SET status = 'QUEUED'
    WHERE status = 'SCHEDULED'
      AND run_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM job_dependencies jd
        JOIN jobs dep ON dep.id = jd.depends_on_job_id
        WHERE jd.job_id = jobs.id AND dep.status <> 'COMPLETED'
      )
  `);
  return result;
}
