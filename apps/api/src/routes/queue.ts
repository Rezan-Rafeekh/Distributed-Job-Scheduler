import type { FastifyInstance } from "fastify";
import { createQueueSchema, updateQueueSchema, OrgRole } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromProject, resolveOrgFromQueue } from "../middleware/rbac.js";
import * as queueService from "../services/queueService.js";

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/projects/:projectId/queues",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const input = parseOrThrow(createQueueSchema, request.body);
      reply.status(201).send(await queueService.createQueue(projectId, input));
    },
  );

  app.get(
    "/projects/:projectId/queues",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      reply.send(await queueService.listQueues(projectId));
    },
  );

  app.get(
    "/queues/:queueId",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      reply.send(await queueService.getQueue(queueId));
    },
  );

  app.patch(
    "/queues/:queueId",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      const input = parseOrThrow(updateQueueSchema, request.body);
      reply.send(await queueService.updateQueue(queueId, input));
    },
  );

  app.delete(
    "/queues/:queueId",
    { preHandler: requireRole(OrgRole.ADMIN, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      await queueService.deleteQueue(queueId);
      reply.status(204).send();
    },
  );

  app.post(
    "/queues/:queueId/pause",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      reply.send(await queueService.setPaused(queueId, true));
    },
  );

  app.post(
    "/queues/:queueId/resume",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      reply.send(await queueService.setPaused(queueId, false));
    },
  );

  app.get(
    "/queues/:queueId/stats",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      reply.send(await queueService.getQueueStats(queueId));
    },
  );
}
