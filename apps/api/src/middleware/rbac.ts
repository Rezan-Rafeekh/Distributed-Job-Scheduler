import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@codity/db";
import { ORG_ROLE_RANK, type OrgRole } from "@codity/shared";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";

export type OrgResolver = (request: FastifyRequest) => Promise<string>;

export const resolveOrgFromParam: OrgResolver = async (request) => {
  const { orgId } = request.params as { orgId?: string };
  if (!orgId) throw new NotFoundError("Organization not found");
  return orgId;
};

export const resolveOrgFromProject: OrgResolver = async (request) => {
  const { projectId } = request.params as { projectId?: string };
  if (!projectId) throw new NotFoundError("Project not found");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) throw new NotFoundError("Project not found");
  return project.organizationId;
};

export const resolveOrgFromProjectQuery: OrgResolver = async (request) => {
  const { projectId } = request.query as { projectId?: string };
  if (!projectId) throw new NotFoundError("projectId query parameter is required");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) throw new NotFoundError("Project not found");
  return project.organizationId;
};

export const resolveOrgFromQueue: OrgResolver = async (request) => {
  const { queueId } = request.params as { queueId?: string };
  if (!queueId) throw new NotFoundError("Queue not found");
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    select: { project: { select: { organizationId: true } } },
  });
  if (!queue) throw new NotFoundError("Queue not found");
  return queue.project.organizationId;
};

export const resolveOrgFromScheduledJob: OrgResolver = async (request) => {
  const { scheduledJobId } = request.params as { scheduledJobId?: string };
  if (!scheduledJobId) throw new NotFoundError("Scheduled job not found");
  const scheduled = await prisma.scheduledJob.findUnique({
    where: { id: scheduledJobId },
    select: { queue: { select: { project: { select: { organizationId: true } } } } },
  });
  if (!scheduled) throw new NotFoundError("Scheduled job not found");
  return scheduled.queue.project.organizationId;
};

export const resolveOrgFromJob: OrgResolver = async (request) => {
  const { jobId } = request.params as { jobId?: string };
  if (!jobId) throw new NotFoundError("Job not found");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { queue: { select: { project: { select: { organizationId: true } } } } },
  });
  if (!job) throw new NotFoundError("Job not found");
  return job.queue.project.organizationId;
};

/**
 * Resolves the acting user's OrgRole for the request's org (walked up the
 * project/queue/job -> org chain via the given resolver) and 403s if below
 * `minRole`. Attaches `request.orgId`/`request.orgRole` for downstream handlers.
 */
export function requireRole(minRole: OrgRole, resolveOrgId: OrgResolver) {
  return async function rbacPreHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new UnauthorizedError("Authentication required");
    const orgId = await resolveOrgId(request);
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: request.user.id } },
    });
    if (!membership || ORG_ROLE_RANK[membership.role as OrgRole] < ORG_ROLE_RANK[minRole]) {
      throw new ForbiddenError(`Requires ${minRole} role or higher in this organization`);
    }
    request.orgId = orgId;
    request.orgRole = membership.role as OrgRole;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    orgId?: string;
    orgRole?: OrgRole;
  }
}
