# Entity-Relationship Diagram

Derived from [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).

```mermaid
erDiagram
    USER ||--o{ ORGANIZATION_MEMBER : "belongs to orgs via"
    ORGANIZATION ||--o{ ORGANIZATION_MEMBER : has
    ORGANIZATION ||--o{ PROJECT : owns
    PROJECT ||--o{ QUEUE : owns
    QUEUE ||--o{ JOB : contains
    QUEUE ||--o{ SCHEDULED_JOB : "has cron templates"
    QUEUE }o--o| RETRY_POLICY : "default policy"
    JOB }o--o| RETRY_POLICY : "override policy"
    JOB }o--o| SCHEDULED_JOB : "materialized from"
    JOB ||--o{ JOB_EXECUTION : "attempted via"
    JOB ||--o| DEAD_LETTER_ENTRY : "may have"
    JOB ||--o{ JOB_DEPENDENCY : "depends on (as jobId)"
    JOB ||--o{ JOB_DEPENDENCY : "blocks (as dependsOnJobId)"
    JOB_EXECUTION ||--o{ JOB_LOG : logs
    WORKER ||--o{ WORKER_HEARTBEAT : sends
    USER ||--o{ DEAD_LETTER_ENTRY : resolves

    USER {
        string id PK
        string email UK
        string passwordHash
        string name
    }
    ORGANIZATION {
        string id PK
        string name
        string slug UK
    }
    ORGANIZATION_MEMBER {
        string id PK
        string organizationId FK
        string userId FK
        enum role "OWNER|ADMIN|MEMBER|VIEWER"
    }
    PROJECT {
        string id PK
        string organizationId FK
        string name
    }
    QUEUE {
        string id PK
        string projectId FK
        string name
        int priority "lower = higher priority, drained first by workers"
        int concurrencyLimit
        bool isPaused
        string defaultRetryPolicyId FK
    }
    RETRY_POLICY {
        string id PK
        enum strategy "FIXED|LINEAR|EXPONENTIAL"
        int baseDelayMs
        int maxDelayMs
        int maxAttempts
        bool jitter
    }
    JOB {
        string id PK
        bigint sequence "monotonic, keyset pagination"
        string queueId FK
        string projectId "denormalized from queue"
        enum type "IMMEDIATE|DELAYED|SCHEDULED|RECURRING|BATCH"
        enum status "SCHEDULED|QUEUED|CLAIMED|RUNNING|COMPLETED|DEAD_LETTER|CANCELLED"
        json payload
        int priority
        datetime runAt
        int attempts
        int maxAttempts
        string retryPolicyId FK
        string scheduledJobId FK
        string batchId
        string idempotencyKey
        string claimedBy "not FK, see design-decisions.md"
    }
    JOB_EXECUTION {
        string id PK
        string jobId FK
        int attemptNumber
        string workerId "not FK"
        enum status "CLAIMED|RUNNING|COMPLETED|FAILED|TIMED_OUT"
        int durationMs
        string error
    }
    JOB_LOG {
        bigint id PK
        string jobExecutionId FK
        datetime timestamp
        enum level "DEBUG|INFO|WARN|ERROR"
        string message
    }
    JOB_DEPENDENCY {
        string id PK
        string jobId FK "the job that must wait"
        string dependsOnJobId FK "must reach COMPLETED first"
    }
    SCHEDULED_JOB {
        string id PK
        string queueId FK
        string cronExpression
        string timezone
        datetime nextRunAt
        bool isActive
    }
    WORKER {
        string id PK
        string hostname
        enum status "ONLINE|DRAINING|OFFLINE"
        int concurrency
        datetime lastHeartbeatAt "denormalized"
    }
    WORKER_HEARTBEAT {
        bigint id PK
        string workerId FK
        datetime timestamp
        int activeJobCount
    }
    DEAD_LETTER_ENTRY {
        string id PK
        string jobId FK, UK
        string reason
        enum resolvedStatus "PENDING|REQUEUED|DISCARDED"
        string resolvedByUserId FK
        json aiSummary "cached AI failure analysis, nullable"
        datetime aiSummaryGeneratedAt
    }
```

## Key design notes

- **`Job.projectId` is a deliberate denormalization** from `Queue.projectId`.
  The global job explorer filters/paginates by project on every request; without
  this, every list query needs a join through `Queue`. It's set once at job
  creation and never mutated, so there's no sync-drift risk.
- **`JobExecution` is split from `Job`** rather than storing the last attempt's
  result on `Job` directly. A job can be attempted N times; `JobExecution` is
  the durable per-attempt record (worker, timing, error, result), which is what
  makes "retry history" and "execution metrics" — both explicit spec
  requirements — a clean indexed query instead of overloading `Job`.
- **`Worker.lastHeartbeatAt` is denormalized** from `WorkerHeartbeat` (the
  append-only history table) so "is this worker dead" is a cheap indexed
  point-lookup on `Worker`, not a `MAX()` aggregate over heartbeat history on
  every dashboard poll.
- **`Job.claimedBy` and `JobExecution.workerId` are plain string references,
  not enforced foreign keys** to `Worker`. Pruning a stale/offline worker row
  must never cascade-delete job history — these fields are set to `null`
  instead when a worker is cleaned up.
- **Cascades**: `Organization → Project → Queue → Job → JobExecution → JobLog`
  all cascade on delete (deleting an org legitimately removes its whole data
  tree). `JobDependency` cascades on both `Job` sides (`jobId` and
  `dependsOnJobId`) — deleting either job in a dependency pair removes the
  edge, never the other job. `OrganizationMember` cascades on both
  `Organization` and `User` sides (deletes only the membership row, never the
  other party's data). Actor references like `DeadLetterEntry.resolvedByUserId`
  use `SET NULL` so audit history survives user deletion.
- **`JobDependency` (bonus: workflow dependencies)** is a plain edge table —
  one row means "`jobId` cannot be claimed until `dependsOnJobId` reaches
  `COMPLETED`." It's enforced entirely by extending the existing
  `SCHEDULED`→`QUEUED` promotion gate (`promoteScheduledJobs.ts`), not by
  touching the atomic claim query; see design-decisions.md for why that's the
  sound place to enforce it. Indexed on both `jobId` and `dependsOnJobId`
  since both lookup directions ("my dependencies" and "who depends on me")
  are queried by the API and the reconciler's cascade-cancel sweep.
- **`DeadLetterEntry.aiSummary` (bonus: AI-generated failure summaries)** is
  cached JSON, nullable until a summary is generated. It's populated on
  demand (`POST /dlq/:jobId/ai-summary`), not eagerly on every dead-letter
  event, since the Claude API call is comparatively slow/costly and most
  dead-lettered jobs are resolved by a human without ever asking for one.

## Indexing strategy

| Index | Table | Purpose |
|---|---|---|
| `(queueId, status, priority, runAt)` | `Job` | The atomic claim query's hot path |
| `(projectId, status, createdAt)` | `Job` | Dashboard job explorer filtering/pagination |
| `(queueId, status)` | `Job` | Per-queue stats (busy count, status breakdown) |
| `(projectId, priority)` | `Queue` | Worker poll loop's priority-tiered queue scan |
| `(isActive, nextRunAt)` | `ScheduledJob` | Cron materializer's due-template scan |
| `(status, lastHeartbeatAt)` | `Worker` | Dead-worker detection sweep |
| `(jobId)`, `(dependsOnJobId)` | `JobDependency` | Both dependency-lookup directions |
| `(workerId, timestamp DESC)` | `WorkerHeartbeat` | Per-worker heartbeat history/sparkline |
| `(jobExecutionId, timestamp)` | `JobLog` | Ordered log retrieval for a single execution |
