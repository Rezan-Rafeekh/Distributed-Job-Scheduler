# API Reference

Full interactive docs (generated from the live route schemas) are served at
`http://localhost:4000/docs` once `apps/api` is running (`@fastify/swagger` +
`@fastify/swagger-ui`). This file is the human-readable companion.

All routes are prefixed with `/api`. All routes except `/auth/*` require
`Authorization: Bearer <accessToken>`.

## Conventions

**Errors** are always shaped:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {}, "requestId": "..." } }
```
`code` is one of `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN`
(403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

**Pagination.** High-volume lists (jobs, logs, heartbeats) use cursor
pagination:
```json
{ "data": [...], "pagination": { "nextCursor": "1234", "hasMore": true } }
```
Pass `?cursor=<nextCursor>` to fetch the next page. Small lists (queues,
workers, members) return a plain array or `{ data, pagination: { page,
pageSize, total } }` for offset pagination.

**Rate limiting.** 100 req/min/IP globally; 10 req/min/IP on `/auth/*`.

**RBAC.** Every org-scoped route resolves the caller's `OrgRole`
(`VIEWER < MEMBER < ADMIN < OWNER`) via the project/queue/job → org chain and
403s below the route's minimum. Worker routes (`/workers/*`) are the one
exception — see design-decisions.md.

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create a user, returns `{ accessToken, refreshToken, user }` |
| POST | `/auth/login` | — | `{ email, password }` → tokens |
| POST | `/auth/refresh` | — | `{ refreshToken }` → new tokens |
| POST | `/auth/logout` | — | Client-side token discard (204) |

## Organizations

| Method | Path | Min role | Description |
|---|---|---|---|
| POST | `/orgs` | — (creator becomes OWNER) | Create an org |
| GET | `/orgs` | — | List orgs the caller belongs to |
| GET | `/orgs/:orgId` | VIEWER | Get org |
| GET | `/orgs/:orgId/members` | VIEWER | List members |
| POST | `/orgs/:orgId/members` | ADMIN | Invite an existing user by email |
| PATCH | `/orgs/:orgId/members/:memberId` | ADMIN | Change a member's role |
| DELETE | `/orgs/:orgId/members/:memberId` | ADMIN | Remove a member |

## Projects

| Method | Path | Min role |
|---|---|---|
| POST | `/orgs/:orgId/projects` | MEMBER |
| GET | `/orgs/:orgId/projects` | VIEWER |
| GET | `/projects/:projectId` | VIEWER |
| PATCH | `/projects/:projectId` | MEMBER |
| DELETE | `/projects/:projectId` | ADMIN |

## Queues

| Method | Path | Min role | Description |
|---|---|---|---|
| POST | `/projects/:projectId/queues` | MEMBER | `{ name, priority?, concurrencyLimit, defaultRetryPolicy? }` |
| GET | `/projects/:projectId/queues` | VIEWER | List queues |
| GET | `/queues/:queueId` | VIEWER | Get queue |
| PATCH | `/queues/:queueId` | MEMBER | Update name/description/concurrencyLimit/priority |
| DELETE | `/queues/:queueId` | ADMIN | Delete queue (cascades to jobs) |
| POST | `/queues/:queueId/pause` | MEMBER | Stop new claims from this queue |
| POST | `/queues/:queueId/resume` | MEMBER | Resume claiming |
| GET | `/queues/:queueId/stats` | VIEWER | `{ byStatus, completedLastHour }` |

## Jobs

| Method | Path | Min role | Description |
|---|---|---|---|
| POST | `/queues/:queueId/jobs` | MEMBER | Create IMMEDIATE / DELAYED / SCHEDULED job (discriminated by `type`) |
| POST | `/queues/:queueId/jobs/batch` | MEMBER | Create N jobs sharing a `batchId` |
| GET | `/queues/:queueId/jobs` | VIEWER | Cursor-paginated, filter by `status`/`type` |
| GET | `/jobs?projectId=` | VIEWER | Global job explorer across all of a project's queues |
| GET | `/jobs/:jobId` | VIEWER | Job detail (includes `dlqEntry` with cached `aiSummary` if generated) |
| GET | `/jobs/:jobId/executions` | VIEWER | Retry/attempt history |
| GET | `/jobs/:jobId/executions/:executionId/logs` | VIEWER | Logs for one attempt |
| GET | `/jobs/:jobId/dependencies` | VIEWER | `{ dependencies: Job[], dependents: Job[] }` (bonus: workflow dependencies) |
| POST | `/jobs/:jobId/cancel` | MEMBER | Cancel a QUEUED/SCHEDULED/CLAIMED job |
| POST | `/jobs/:jobId/retry` | MEMBER | Manually requeue a DEAD_LETTER job |

**Create job payload** (discriminated union on `type`):
```jsonc
// IMMEDIATE
{ "type": "IMMEDIATE", "payload": { "handler": "echo" }, "priority": 5 }
// DELAYED
{ "type": "DELAYED", "delayMs": 60000, "payload": {} }
// SCHEDULED
{ "type": "SCHEDULED", "runAt": "2026-08-01T09:00:00Z", "payload": {} }
```
Optional on all: `retryPolicy` (override), `maxAttempts`, `idempotencyKey`,
`dependsOnJobIds` (bonus: workflow dependencies — up to 20 job UUIDs; when
present the job is created `SCHEDULED` regardless of `type` and only
promotes to `QUEUED` once every listed job reaches `COMPLETED`).

## Scheduled jobs (cron templates)

| Method | Path | Min role |
|---|---|---|
| POST | `/queues/:queueId/scheduled-jobs` | MEMBER |
| GET | `/queues/:queueId/scheduled-jobs` | VIEWER |
| PATCH | `/scheduled-jobs/:scheduledJobId` | MEMBER |
| DELETE | `/scheduled-jobs/:scheduledJobId` | MEMBER |

## Workers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/workers` | any authenticated user | Fleet status |
| GET | `/workers/:workerId` | any authenticated user | One worker |
| GET | `/workers/:workerId/heartbeats` | any authenticated user | Recent heartbeats |

## Dead Letter Queue

| Method | Path | Min role | Description |
|---|---|---|---|
| GET | `/dlq?projectId=&resolvedStatus=` | VIEWER | |
| POST | `/dlq/:jobId/requeue` | MEMBER | |
| POST | `/dlq/:jobId/discard` | MEMBER | |
| POST | `/dlq/:jobId/ai-summary` | MEMBER | `{ regenerate?: boolean }` — bonus: AI-generated failure summary via Claude. Cached on `DeadLetterEntry.aiSummary`; `regenerate: true` forces a fresh call. 503s with a clear message if `ANTHROPIC_API_KEY` is unset. |

## Metrics

| Method | Path | Min role |
|---|---|---|
| GET | `/projects/:projectId/metrics/throughput?hours=24` | VIEWER |
| GET | `/projects/:projectId/metrics/health` | VIEWER |

## WebSocket

`GET /api/ws?token=<accessToken>&projectId=<optional>` — upgrades to a
WebSocket connection. Events pushed as JSON, shape defined in
`packages/shared/src/wsEvents.ts`:
- `job.status_changed` `{ projectId, jobId, queueId, status, timestamp }`
- `queue.stats_changed` `{ projectId, queueId, timestamp }`
- `worker.heartbeat` `{ workerId, activeJobCount, timestamp }` (global, no projectId)
- `worker.status_changed` `{ workerId, status, timestamp }` (global, no projectId)
