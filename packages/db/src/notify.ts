import { Prisma, type PrismaClient } from "@prisma/client";

type NotifyClient = PrismaClient | Prisma.TransactionClient;

/**
 * Fire-and-forget Postgres NOTIFY, used as the cross-process pub/sub backbone
 * for WebSocket live updates (apps/api LISTENs on these channels). Payloads
 * must stay small — Postgres caps NOTIFY payloads at 8000 bytes — so callers
 * should only send ids/status/timestamp, never full records. Accepts either
 * the shared client or a transaction client, since NOTIFY delivery is
 * deferred until commit anyway -- issuing it from inside a transaction (so
 * it only fires if that transaction actually commits) is a legitimate use.
 */
export async function notify(db: NotifyClient, channel: string, payload: object): Promise<void> {
  const json = JSON.stringify(payload);
  await db.$executeRaw(Prisma.sql`SELECT pg_notify(${channel}, ${json})`);
}
