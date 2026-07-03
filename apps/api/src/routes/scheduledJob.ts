import type { FastifyInstance } from "fastify";
import { createScheduledJobSchema, OrgRole } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromQueue, resolveOrgFromScheduledJob } from "../middleware/rbac.js";
import * as scheduledJobService from "../services/scheduledJobService.js";

export async function scheduledJobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/queues/:queueId/scheduled-jobs",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      const input = parseOrThrow(createScheduledJobSchema, request.body);
      reply.status(201).send(await scheduledJobService.createScheduledJob(queueId, input));
    },
  );

  app.get(
    "/queues/:queueId/scheduled-jobs",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      reply.send(await scheduledJobService.listScheduledJobs(queueId));
    },
  );

  app.patch(
    "/scheduled-jobs/:scheduledJobId",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromScheduledJob) },
    async (request, reply) => {
      const { scheduledJobId } = request.params as { scheduledJobId: string };
      reply.send(await scheduledJobService.updateScheduledJob(scheduledJobId, request.body as never));
    },
  );

  app.delete(
    "/scheduled-jobs/:scheduledJobId",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromScheduledJob) },
    async (request, reply) => {
      const { scheduledJobId } = request.params as { scheduledJobId: string };
      await scheduledJobService.deleteScheduledJob(scheduledJobId);
      reply.status(204).send();
    },
  );
}
