import { Client as PgClient } from "pg";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { NOTIFY_CHANNELS, type WsEvent } from "@codity/shared";
import { verifyAccessToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";

interface Room {
  project: Map<string, Set<WebSocket>>;
  global: Set<WebSocket>;
}

/**
 * Bridges Postgres LISTEN/NOTIFY (the cross-process pub/sub backbone — see
 * docs/design-decisions.md for why not Redis) to browser WebSocket clients.
 * apps/worker is a *different OS process* from apps/api, so NOTIFY is what
 * gets a job-status change from the process that made it to the process
 * holding the live dashboard connections, with zero new infrastructure.
 */
export async function registerWebSocketGateway(app: FastifyInstance): Promise<void> {
  const rooms: Room = { project: new Map(), global: new Set() };

  const pgClient = new PgClient({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  await pgClient.query(`LISTEN ${NOTIFY_CHANNELS.JOB_EVENTS}`);
  await pgClient.query(`LISTEN ${NOTIFY_CHANNELS.WORKER_EVENTS}`);
  await pgClient.query(`LISTEN ${NOTIFY_CHANNELS.QUEUE_EVENTS}`);

  pgClient.on("notification", (msg) => {
    if (!msg.payload) return;
    let event: WsEvent;
    try {
      event = JSON.parse(msg.payload) as WsEvent;
    } catch {
      logger.warn({ payload: msg.payload }, "received malformed WS notify payload");
      return;
    }

    // job.*/queue.* events are project-scoped; worker.* events have no
    // projectId (workers are a shared fleet, see rbac.ts) so they broadcast
    // to every connected client via the global room.
    const targets = "projectId" in event ? (rooms.project.get(event.projectId) ?? new Set()) : rooms.global;
    const payload = JSON.stringify(event);
    for (const socket of targets) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  });

  pgClient.on("error", (err) => logger.error({ err }, "pg LISTEN client error"));

  app.addHook("onClose", async () => {
    await pgClient.end();
  });

  app.get("/ws", { websocket: true }, (socket, request) => {
    const { projectId, token } = request.query as { projectId?: string; token?: string };

    if (!token) {
      socket.close(4001, "Missing auth token");
      return;
    }
    try {
      verifyAccessToken(token);
    } catch {
      socket.close(4001, "Invalid auth token");
      return;
    }

    rooms.global.add(socket);
    if (projectId) {
      if (!rooms.project.has(projectId)) rooms.project.set(projectId, new Set());
      rooms.project.get(projectId)!.add(socket);
    }

    socket.on("close", () => {
      rooms.global.delete(socket);
      if (projectId) rooms.project.get(projectId)?.delete(socket);
    });
  });
}
