import { Prisma, type PrismaClient } from "@prisma/client";

export interface ClaimedJob {
  id: string;
  sequence: bigint;
  queueId: string;
  projectId: string;
  type: string;
  status: string;
  payload: unknown;
  priority: number;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  retryPolicyId: string | null;
  scheduledJobId: string | null;
  batchId: string | null;
  idempotencyKey: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
}

interface ClaimJobsRawRow {
  id: string;
  sequence: bigint;
  queue_id: string;
  project_id: string;
  type: string;
  status: string;
  payload: unknown;
  priority: number;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  retry_policy_id: string | null;
  scheduled_job_id: string | null;
  batch_id: string | null;
  idempotency_key: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
}

/**
 * Atomically claims up to `limit` due jobs from a single queue for `workerId`,
 * respecting the queue's concurrency_limit (jobs already CLAIMED or RUNNING
 * count against it) and the caller's own local free capacity.
 *
 * Safe under concurrent callers: `FOR UPDATE SKIP LOCKED` means two workers
 * running this simultaneously never select the same row — the second simply
 * skips whatever the first has already locked. This is the query that
 * guarantees "no duplicate execution" for the whole system.
 *
 * Deliberately THREE sequential statements inside one transaction, not one
 * mega WITH-statement. An earlier version computed busy_count in the same
 * statement as the `FOR UPDATE` queue lock and overshot concurrency_limit
 * under real concurrency (proven by the integration test below, ~2/3 runs):
 * when a statement blocks waiting on a row lock, Postgres's EvalPlanQual
 * re-check on wake only refreshes *that locked row*, not other tables' data
 * already read earlier in the same statement's snapshot — so the busy_count
 * subquery kept seeing a pre-wait snapshot even after the lock wait resolved.
 * Issuing the lock and the busy_count read as separate statements forces the
 * second to take a fresh Read Committed snapshot *after* the wait, which is
 * what actually makes the capacity check atomic with the claim.
 */
export async function claimJobs(
  db: PrismaClient,
  queueId: string,
  workerLocalFreeCapacity: number,
  workerId: string,
): Promise<ClaimedJob[]> {
  if (workerLocalFreeCapacity <= 0) return [];

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<[{ concurrency_limit: number; is_paused: boolean }]>(Prisma.sql`
      SELECT concurrency_limit, is_paused FROM queues WHERE id = ${queueId} FOR UPDATE
    `);
    if (!locked || locked.is_paused) return [];

    const [{ busy_count }] = await tx.$queryRaw<[{ busy_count: bigint }]>(Prisma.sql`
      SELECT count(*) AS busy_count FROM jobs WHERE queue_id = ${queueId} AND status IN ('CLAIMED', 'RUNNING')
    `);
    const freeSlots = Math.max(locked.concurrency_limit - Number(busy_count), 0);
    const limit = Math.min(freeSlots, workerLocalFreeCapacity);
    if (limit <= 0) return [];

    const rows = await tx.$queryRaw<ClaimJobsRawRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT id FROM jobs
        WHERE queue_id = ${queueId}
          AND status = 'QUEUED'
          AND run_at <= now()
        ORDER BY priority ASC, run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE jobs
      SET status = 'CLAIMED', claimed_by = ${workerId}, claimed_at = now(), updated_at = now()
      WHERE id IN (SELECT id FROM candidates)
      RETURNING
        id, sequence, queue_id, project_id, type, status, payload, priority, run_at,
        attempts, max_attempts, retry_policy_id, scheduled_job_id, batch_id,
        idempotency_key, claimed_by, claimed_at;
    `);

    return rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      queueId: row.queue_id,
      projectId: row.project_id,
      type: row.type,
      status: row.status,
      payload: row.payload,
      priority: row.priority,
      runAt: row.run_at,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      retryPolicyId: row.retry_policy_id,
      scheduledJobId: row.scheduled_job_id,
      batchId: row.batch_id,
      idempotencyKey: row.idempotency_key,
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at,
    }));
  });
}
