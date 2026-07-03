import type { FastifyInstance } from "fastify";
import { OrgRole } from "@codity/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromJob, resolveOrgFromProjectQuery } from "../middleware/rbac.js";
import * as dlqService from "../services/dlqService.js";

export async function dlqRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/dlq",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProjectQuery) },
    async (request, reply) => {
      const { projectId, resolvedStatus } = request.query as { projectId: string; resolvedStatus?: string };
      reply.send(await dlqService.listDlqEntries(projectId, resolvedStatus));
    },
  );

  app.post(
    "/dlq/:jobId/requeue",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await dlqService.requeueFromDlq(jobId));
    },
  );

  app.post(
    "/dlq/:jobId/discard",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await dlqService.discardFromDlq(jobId, request.user!.id));
    },
  );

  app.post(
    "/dlq/:jobId/ai-summary",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const { regenerate } = (request.body as { regenerate?: boolean }) ?? {};
      reply.send(await dlqService.generateFailureSummary(jobId, regenerate ?? false));
    },
  );
}
