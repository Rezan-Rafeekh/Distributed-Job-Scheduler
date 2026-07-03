import type { FastifyInstance } from "fastify";
import { createBatchJobSchema, createJobSchema, jobListQuerySchema, OrgRole } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromJob, resolveOrgFromProjectQuery, resolveOrgFromQueue } from "../middleware/rbac.js";
import * as jobService from "../services/jobService.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/queues/:queueId/jobs",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      const input = parseOrThrow(createJobSchema, request.body);
      reply.status(201).send(await jobService.createJob(queueId, input));
    },
  );

  app.post(
    "/queues/:queueId/jobs/batch",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      const input = parseOrThrow(createBatchJobSchema, request.body);
      reply.status(201).send(await jobService.createBatch(queueId, input));
    },
  );

  app.get(
    "/queues/:queueId/jobs",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromQueue) },
    async (request, reply) => {
      const { queueId } = request.params as { queueId: string };
      const query = parseOrThrow(jobListQuerySchema, request.query);
      reply.send(await jobService.listJobsForQueue(queueId, query));
    },
  );

  app.get(
    "/jobs",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProjectQuery) },
    async (request, reply) => {
      const { projectId } = request.query as { projectId: string };
      const query = parseOrThrow(jobListQuerySchema, request.query);
      reply.send(await jobService.listJobsGlobal(projectId, query));
    },
  );

  app.get(
    "/jobs/:jobId",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await jobService.getJob(jobId));
    },
  );

  app.get(
    "/jobs/:jobId/dependencies",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await jobService.getJobDependencies(jobId));
    },
  );

  app.get(
    "/jobs/:jobId/executions",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await jobService.getJobExecutions(jobId));
    },
  );

  app.get(
    "/jobs/:jobId/executions/:executionId/logs",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId, executionId } = request.params as { jobId: string; executionId: string };
      reply.send(await jobService.getExecutionLogs(jobId, executionId));
    },
  );

  app.post(
    "/jobs/:jobId/cancel",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await jobService.cancelJob(jobId));
    },
  );

  app.post(
    "/jobs/:jobId/retry",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromJob) },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      reply.send(await jobService.retryJob(jobId));
    },
  );
}
