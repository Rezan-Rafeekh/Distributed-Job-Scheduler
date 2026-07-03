# Codity — Distributed Job Scheduler

A production-inspired distributed job scheduling platform: authenticated
multi-tenant projects/queues, immediate/delayed/scheduled/recurring/batch
jobs, atomic job claiming across concurrent workers, configurable retry
strategies, a Dead Letter Queue, live-updating dashboard, and a from-scratch
worker execution engine built directly on Postgres (no BullMQ/Redis).

See also: [Architecture](./docs/architecture.md) · [ER Diagram](./docs/er-diagram.md) ·
[API Reference](./docs/api.md) · [Design Decisions](./docs/design-decisions.md)

## Stack

Node.js + TypeScript everywhere · Fastify (API) · Prisma + PostgreSQL 16 ·
React + Vite + Tailwind (dashboard) · npm workspaces + Turborepo (monorepo) ·
Vitest (tests).

## Prerequisites

- Node.js ≥ 20
- Docker Desktop (for local Postgres via `docker-compose.yml`) — alternatively
  point `DATABASE_URL` at any Postgres 14+ instance you already have.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Build packages/shared and packages/db once — apps/api and apps/worker
#    resolve them as regular compiled packages (not raw TS source), so this
#    is required before `npm run dev` will find them. Turborepo's dependency
#    graph (turbo.json) means `npm run build` also re-triggers this correctly
#    whenever packages/* changes.
npm run build

# 3. Start Postgres
docker compose up -d

# 4. Configure environment
cp .env.example .env
# edit .env if you're not using the default docker-compose Postgres

# 5. Run migrations and seed demo data
npm run db:migrate
npm run db:seed
```

This seeds a demo org ("Demo Org") with four users covering every RBAC role
(`demo@codity.dev` OWNER / `admin@codity.dev` ADMIN / `member@codity.dev`
MEMBER / `viewer@codity.dev` VIEWER, all `password123`), two projects, five
queues (one paused), and ~45 jobs spanning every job type, status, retry
strategy, a batch mid-flight, a recurring cron template with materialized
history, and three workflow-dependency chains in different states (blocked,
released, cascade-cancelled) — enough to see every feature without manually
creating data first.

## Running the platform

Each app runs as its own process — that's deliberate, it's what makes this
"distributed" rather than a monolith (see architecture doc).

```bash
# All three apps, in parallel, with hot reload:
npm run dev

# Or individually:
npm run dev --workspace=@codity/api      # http://localhost:4000  (docs at /docs)
npm run dev --workspace=@codity/worker   # background process, no HTTP
npm run dev --workspace=@codity/web      # http://localhost:5173
```

Run multiple worker processes to see distributed claiming in action — open
two terminals and run `npm run dev --workspace=@codity/worker` in both; they
will race for the same queued jobs and never double-claim one (see the
concurrency integration test for a proof of this under load).

## Testing

```bash
npm run test        # every package/app, via Turborepo
```

The highest-value test is
`packages/db/test/claimJobs.integration.test.ts` — it fires concurrent
claim calls at a real Postgres instance and asserts zero duplicate claims and
no concurrency-limit overshoot. Worker lifecycle tests
(`apps/worker/test/executor.test.ts`) and API route tests
(`apps/api/test/*.test.ts`) also run against the same local Postgres, so
`docker compose up -d` must be running first.

## Project structure

```
apps/
  api/      REST API + WebSocket gateway (Fastify)
  worker/   Poll loop, executor, heartbeats, reconciler — the queue engine
  web/      React dashboard
packages/
  db/       Prisma schema, migrations, the atomic claim query
  shared/   Cross-process types, zod DTOs, retry math, state machine
docs/       Architecture, ER diagram, API reference, design decisions
```

## Demo script (what to click through)

1. Log in with the seeded demo user, land on the project **Overview** page —
   live stat tiles, a throughput chart, and a live-activity feed.
2. Open **Queues** — `webhooks` is paused on purpose so its backlog stays
   visible; try resuming it and watch the queued jobs drain live.
3. **Job Explorer** → open any `DEAD_LETTER` job — the **AI Failure
   Analysis** card is pre-generated on one seeded job (works without an API
   key); try **Generate analysis** on another (needs `ANTHROPIC_API_KEY`, or
   503s with a clear message if unset).
4. Open a job created with `dependsOnJobIds` to see the **dependency graph**
   (hand-rolled SVG DAG) — the seed data includes one still-blocked chain, one
   already-released chain, and one that gets cascade-cancelled by the live
   reconciler within ~30s of seeding.
5. **Pipeline** page — a live animated queue → worker → outcome view driven
   by the same WebSocket events as the rest of the dashboard.
6. Toggle **light/dark mode** from the sidebar.
7. Start a worker (`npm run dev --workspace=@codity/worker`) and watch jobs
   flow `QUEUED → CLAIMED → RUNNING → COMPLETED` live on the Job Explorer and
   Queue Detail pages.
8. Create a job with `payload.handler = "fail-always"` and a low
   `maxAttempts` to watch it retry with visible backoff, then land in the
   Dead Letter Queue — requeue it from there.
9. Check the **Workers** page for fleet status/heartbeats, and **Metrics**
   for the throughput chart.
