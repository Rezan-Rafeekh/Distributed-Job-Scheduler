import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import * as workerService from "../services/workerService.js";

/**
 * Workers are a shared fleet, not scoped to a single org/project in this
 * schema (see docs/design-decisions.md) — any authenticated user can view
 * fleet status, matching how most job-scheduler dashboards expose worker
 * health as shared operational infrastructure rather than tenant data.
 */
export async function workerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/workers", async (_request, reply) => {
    reply.send(await workerService.listWorkers());
  });

  app.get("/workers/:workerId", async (request, reply) => {
    const { workerId } = request.params as { workerId: string };
    reply.send(await workerService.getWorker(workerId));
  });

  app.get("/workers/:workerId/heartbeats", async (request, reply) => {
    const { workerId } = request.params as { workerId: string };
    reply.send(await workerService.getWorkerHeartbeats(workerId));
  });
}
