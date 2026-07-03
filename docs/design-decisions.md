# Design Decisions

This is a running log of the trade-offs made while building Codity, in the
order a reader would naturally hit them. Each entry states the decision, the
alternative considered, and why the alternative lost.

## Infrastructure & tooling

**npm workspaces + Turborepo, not pnpm.** The plan originally called for
pnpm (stricter dependency resolution, faster installs), but the target
machine had npm 11 already installed and no pnpm — rather than add a new
global tool for a marginal ergonomic win, the monorepo uses npm workspaces.
Turborepo is layered on top regardless for task-graph caching (`build`,
`test`, `typecheck` only rerun what changed), since that value is independent
of which package manager drives installs.

**Postgres, chosen specifically for `FOR UPDATE SKIP LOCKED`, `LISTEN`/`NOTIFY`,
and `pg_try_advisory_lock`.** These three primitives replace what would
otherwise be a message broker (for claiming), a pub/sub service like Redis
(for live updates), and a distributed lock service (for leader election).
The cost is coupling the design to Postgres specifically — a NoSQL or MySQL
backend would need a materially different concurrency story. That coupling is
accepted deliberately: one moving part to operate beats four.

## The atomic claim query

**Raw SQL via `$queryRaw`, not Prisma's query builder.** Prisma cannot express
`FOR UPDATE SKIP LOCKED` combined with a capacity-aware read and a dynamic
`LIMIT`, so `packages/db/src/queries/claimJobs.ts` is hand-written SQL. This
is the query the entire reliability story depends on — see the concurrency
integration test in `packages/db/test/claimJobs.integration.test.ts`, which
fires concurrent claim calls and asserts zero duplicate claims and no
capacity overshoot. This test is deliberately run 10x in a row in CI-adjacent
verification, not just once — see the next entry for why that mattered.

**Capacity counts `CLAIMED + RUNNING`, not just `RUNNING`.** A job sits in
`CLAIMED` for a brief window between being claimed and the worker actually
marking it `RUNNING`. Counting only `RUNNING` toward the concurrency limit
would let a burst of near-simultaneous claims overshoot it during that
window; counting `CLAIMED` too closes that gap.

**The claim is three sequential statements inside one Prisma `$transaction`
(lock the queue row → read busy_count → claim), not one clever mega
WITH-statement.** This took two attempts to get right, and the failure mode
in between is worth recording because it's non-obvious. The first version
locked the queue row (`FOR UPDATE`) and computed `busy_count` in CTEs of the
*same* single statement as the final claiming `UPDATE`. The concurrency test
caught this as flaky — roughly 2 of every 3 runs overshot `concurrencyLimit`
by 2-3x under 8 concurrent callers. Root cause, confirmed by reproducing the
exact behavior with a raw `pg` client (no Prisma involved, ruling out an ORM
bug): when a statement blocks waiting on a `FOR UPDATE` row lock, Postgres's
re-check on waking (EvalPlanQual) only refreshes *that specific locked row*;
it does **not** take a fresh snapshot for the rest of the statement. The
`busy_count` subquery — reading a different table (`jobs`), not the locked
row — kept using the snapshot taken at the *start* of the statement, i.e.
before the wait resolved, so it could still see a stale (pre-commit)
job-status count even after correctly waiting for the lock. Two concurrent
callers would each wait their turn for the queue lock, but both would still
compute `busy_count` as if the other hadn't claimed anything yet, and both
would proceed to claim up to the full limit.

The fix: issue the lock and the `busy_count` read as **separate statements**
in an explicit transaction. Read Committed (Postgres's default) takes a new
snapshot at the start of *every* statement, so the second statement's
`busy_count` read genuinely reflects everything committed by the time the
first statement's wait resolved — which is what a "check-then-act" pattern
actually requires. Verified with 10 consecutive clean runs of the integration
test after the fix (versus ~2/3 failure before it). The trade-off is
unchanged from the original intent: claims against the *same* queue
serialize to one in-flight claim at a time (three round-trips instead of
one), while claims against *different* queues remain fully parallel.

**Two concurrency limits are enforced in the same transaction**: the queue's
`concurrencyLimit` (shared across every worker touching that queue) and the
calling worker's own local free capacity (its semaphore's remaining slots).
`Math.min(queueFreeSlots, workerLocalFreeCapacity)` becomes the final claim
statement's `LIMIT`, satisfying both without a fourth round-trip.

## Job state machine

**Retryable failures never rest in a literal `Job.status = FAILED`.** On
failure with attempts remaining, `Job` goes straight back to `SCHEDULED`
(re-armed with a computed `runAt`); the failure itself is recorded on the
`JobExecution` row (`status = FAILED`) for that attempt. `Job.status` only
reflects the job's *current* disposition, not attempt-by-attempt history —
that history lives in `JobExecution`, which is also what "retry history" as
a spec requirement actually means. The alternative (a `FAILED` resting state
that a scheduler later promotes back to `QUEUED`) adds a state and a
promotion step for no behavioral gain.

**Manual DLQ requeue does not reset the attempts counter.** Requeuing from
`DEAD_LETTER` sets `status = QUEUED` and clears `claimedBy`/`lastError`, but
leaves `attempts` as-is. This is a deliberate, documented bypass: a human
requeuing a dead-lettered job gets exactly one more attempt cycle at the
original `maxAttempts` ceiling, not a full reset that could mask a
systematically broken handler retriggering the same failure loop forever.

**A job can be dead-lettered more than once, so writing its `DeadLetterEntry`
must be an upsert, not a create.** `DeadLetterEntry.jobId` is unique (one entry
per job), which is correct for the common case — but the manual-requeue path
above means a job can legitimately re-enter `DEAD_LETTER` after being requeued
and failing again. The first implementation used `create()` and crashed with
a unique-constraint violation the second time a requeued job exhausted its
retries (caught live, not by a test, while running the app — a good reminder
that "it passed the test suite" and "it survives a real run" are different
claims). Fixed with `upsert()`, which resets `resolvedStatus` back to
`PENDING` on the existing row rather than erroring.

**`SCHEDULED → QUEUED` promotion runs on every worker's poll tick, without
leader election** — unlike cron materialization and dead-worker detection,
which run inside the leader-elected reconciler. The promoter is a single
idempotent `UPDATE ... WHERE status='SCHEDULED' AND run_at<=now()`; running
it from every worker concurrently is harmless (Postgres serializes the
`UPDATE`s) and keeps due-job latency tied to the fast poll interval (~1.5s)
rather than the slower reconciler interval (~30s), which matters for
short-delay retries.

## Reliability & concurrency

**Leader election via `pg_try_advisory_xact_lock` (transaction-scoped), not a
dedicated lock service — and specifically not the session-scoped
`pg_try_advisory_lock`.** Cron materialization and dead-worker detection must
run exactly once across a fleet of worker replicas — double materialization
would create duplicate recurring-job instances. A single fixed advisory-lock
key gives single-leader semantics with zero new infrastructure. The first
implementation used the session-scoped variant (`pg_try_advisory_lock` +
a manual `pg_advisory_unlock` in a `finally` block) and this was a real bug,
not a hypothetical one: a worker process was force-killed mid-tick during
testing, its pooled connection stayed open-but-idle, and the lock it held was
never released — every subsequent reconciler tick, on any worker, silently
found the lock unavailable forever, so cron materialization and dead-worker
detection simply stopped happening with no error anywhere. The root cause is
that a session-scoped advisory lock is tied to whichever *physical connection*
acquired it, but Prisma's shared client pools connections across calls — there
is no guarantee the later unlock statement lands on the same connection that
took the lock. The fix wraps the lock acquisition and all reconciler work in
one `db.$transaction(async (tx) => ...)`, using `pg_try_advisory_xact_lock`
(auto-released at commit/rollback, no manual unlock) — `$transaction`'s
callback guarantees every statement inside it runs on one held connection, so
there's no cross-connection mismatch possible. The trade-off is unchanged from
the original intent: if the current leader's tick runs long, no other replica
picks up reconciliation work until it commits (acceptable — the work per tick
is cheap and bounded).

**Execution semantics are honestly at-least-once, not exactly-once.** A
worker crash between an external side effect completing and the `COMPLETED`
write being persisted will cause the reconciler's stale-claim sweep to
requeue an already-effectively-completed job, which then re-executes. This is
a fundamental trade-off of pull-based, crash-tolerant execution without
distributed transactions spanning the job's side effects and Postgres, and is
mitigated (not eliminated) by `Job.idempotencyKey`, which prevents duplicate
*job creation* from retried API calls — a related but distinct guarantee from
duplicate *execution*. A production system would push idempotency further
into individual handlers (e.g. an idempotency key passed to downstream APIs).

**Dead-worker threshold is `3× the heartbeat interval`.** Tolerating two
missed beats before declaring a worker dead absorbs transient GC pauses or
brief DB blips without false-positive-orphaning jobs that are still being
worked; too high a multiplier delays legitimate recovery after a real crash.
3x was chosen as a reasonable middle ground, not derived from measurement —
flagged here as a tunable, not a proven constant.

**Bounded concurrency via a hand-rolled semaphore, not `p-limit` or similar.**
The explicit goal of this project is a from-scratch queue engine; pulling in
a concurrency-limiting library for the one piece that most directly
demonstrates "executes jobs concurrently" would undercut that. The
implementation is ~20 lines and has no reason to grow.

**Queue-level `priority` is enforced as strict tiers, not a soft weighting.**
When one worker sees multiple unpaired queues on a poll tick, it groups them
by `Queue.priority` (lower = higher priority, same convention as
`Job.priority`) and gives the highest-priority tier first claim on its free
capacity; only what's left over reaches the next tier. Within a tier,
capacity is split evenly. The alternative — a proportional/weighted split
across all queues regardless of tier — is more "fair" but defeats the point
of a priority queue: a flooded low-priority queue should not be able to starve
a high-priority one of capacity, and strict tiering guarantees that. The
trade-off is real and named here: a busy high-priority queue can legitimately
starve a lower-priority one for a given worker's capacity on a given tick —
that's the intended behavior of "priority," not a bug.

## Live updates

**Postgres `LISTEN`/`NOTIFY`, not Redis pub/sub.** `apps/worker` (where most
state changes originate) and `apps/api` (where WebSocket connections live)
are different OS processes. NOTIFY is the bridge Postgres already gives us
between them, at the cost of two known limitations, both accepted: payloads
are capped at 8000 bytes (mitigated by sending only ids/status/timestamp and
letting clients refetch full detail over REST) and NOTIFY delivery is
best-effort/fire-and-forget with no persistence or replay (acceptable because
polling remains the correctness baseline — see next entry).

**WebSocket updates enhance polling; they never replace it.** Every dashboard
list view keeps its TanStack Query `refetchInterval` running regardless of
WebSocket connection state. If the socket drops or a NOTIFY is missed, the
dashboard is at most one poll interval stale rather than silently wrong. This
costs a small amount of redundant polling traffic in exchange for the live
layer being a pure latency optimization with no failure mode of its own.

## API

**Cursor (keyset) pagination for jobs/logs/heartbeats, offset pagination for
queues/workers/members.** High-volume, frequently-appended tables use a
`sequence`-based cursor so pages stay stable and cheap even as new rows are
inserted between requests (`OFFSET` on a fast-growing table both drifts and
gets slower with depth). Small, roughly-static lists use plain offset
pagination because total-count and jump-to-page are more useful there than
cursor stability.

**Validation is manual `zod.safeParse()` in each route, not Fastify's JSON
schema compiler wired to zod.** `packages/shared`'s zod schemas are reused as
the single source of truth for both server-side validation and (via type
inference) client-side form types. Wiring zod through Fastify's schema
compiler would add configuration for a marginal perf/ergonomics gain; the
chosen approach is simpler to read end-to-end at the cost of not getting
auto-generated OpenAPI parameter schemas from the same zod definitions
(the OpenAPI docs are hand-described via `@fastify/swagger` instead).

**Stateless JWTs, no server-side revocation list.** `/auth/logout` is a
client-side token discard; there is no blocklist checked on every request.
This is a deliberate simplicity trade-off for a system with a 15-minute
access token TTL — the exposure window for a compromised token is bounded by
TTL rather than by revocation, which is a materially weaker guarantee than a
real revocation store but proportionate to this project's scope.

**Workers are a shared fleet, not tenant/org-scoped.** The `Worker` table has
no `organizationId`/`projectId`. Any authenticated user can see the full
worker fleet's health via `GET /workers`. This mirrors how most
job-scheduler dashboards (Sidekiq, etc.) treat worker processes as shared
operational infrastructure rather than per-tenant data — the alternative
(scoping workers to whichever queues they happen to be polling at a given
moment) doesn't map cleanly onto how a worker process actually operates,
since a single worker polls across all unpaused queues it can see.

## Frontend

**Beige (`#F8F3EA` background family) + cherry red (`#C81E3A`) as the two
brand colors**, chosen per product direction; supporting neutral/status
colors were picked and *validated* (not eyeballed) using the dataviz skill's
palette validator — the chart's "Completed" green (`#1F9D55`) was swapped
from an initial too-desaturated `#3F7A52` after the validator flagged it
below the chroma floor.

**Recharts for the metrics chart, a hand-rolled component library for
everything else.** Building a full charting primitive from scratch (axes,
tooltips, responsive containers) for one throughput chart wasn't a good use
of scope relative to the rest of the system; the dashboard's non-chart UI
(cards, buttons, status pills, tables) is deliberately minimal/hand-built
since that's where the beige/cherry theme actually needs to feel bespoke.
