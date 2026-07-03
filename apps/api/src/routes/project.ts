import type { FastifyInstance } from "fastify";
import { createProjectSchema, updateProjectSchema, OrgRole } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromParam, resolveOrgFromProject } from "../middleware/rbac.js";
import * as projectService from "../services/projectService.js";

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/orgs/:orgId/projects",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const input = parseOrThrow(createProjectSchema, request.body);
      reply.status(201).send(await projectService.createProject(orgId, input));
    },
  );

  app.get(
    "/orgs/:orgId/projects",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      reply.send(await projectService.listProjects(orgId));
    },
  );

  app.get(
    "/projects/:projectId",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      reply.send(await projectService.getProject(projectId));
    },
  );

  app.patch(
    "/projects/:projectId",
    { preHandler: requireRole(OrgRole.MEMBER, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const input = parseOrThrow(updateProjectSchema, request.body);
      reply.send(await projectService.updateProject(projectId, input));
    },
  );

  app.delete(
    "/projects/:projectId",
    { preHandler: requireRole(OrgRole.ADMIN, resolveOrgFromProject) },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      await projectService.deleteProject(projectId);
      reply.status(204).send();
    },
  );
}
