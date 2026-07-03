import type { FastifyInstance } from "fastify";
import { OrgRole } from "@codity/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromProject } from "../middleware/rbac.js";
import * as metricsService from "../services/metricsService.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/projects/:projectId/metrics/throughput",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const { hours } = request.query as { hours?: string };
      reply.send(await metricsService.getThroughput(projectId, hours ? Number(hours) : undefined));
    },
  );

  app.get(
    "/projects/:projectId/metrics/health",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      reply.send(await metricsService.getHealth(projectId));
    },
  );
}
