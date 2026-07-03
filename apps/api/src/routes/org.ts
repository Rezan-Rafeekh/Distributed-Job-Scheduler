import type { FastifyInstance } from "fastify";
import { createOrgSchema, inviteMemberSchema, updateMemberRoleSchema, OrgRole } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, resolveOrgFromParam } from "../middleware/rbac.js";
import * as orgService from "../services/orgService.js";

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post("/orgs", async (request, reply) => {
    const input = parseOrThrow(createOrgSchema, request.body);
    const org = await orgService.createOrg(request.user!.id, input);
    reply.status(201).send(org);
  });

  app.get("/orgs", async (request, reply) => {
    reply.send(await orgService.listOrgsForUser(request.user!.id));
  });

  app.get(
    "/orgs/:orgId",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      reply.send(await orgService.getOrg(orgId));
    },
  );

  app.get(
    "/orgs/:orgId/members",
    { preHandler: requireRole(OrgRole.VIEWER, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      reply.send(await orgService.listMembers(orgId));
    },
  );

  app.post(
    "/orgs/:orgId/members",
    { preHandler: requireRole(OrgRole.ADMIN, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const input = parseOrThrow(inviteMemberSchema, request.body);
      reply.status(201).send(await orgService.inviteMember(orgId, input));
    },
  );

  app.patch(
    "/orgs/:orgId/members/:memberId",
    { preHandler: requireRole(OrgRole.ADMIN, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId, memberId } = request.params as { orgId: string; memberId: string };
      const input = parseOrThrow(updateMemberRoleSchema, request.body);
      reply.send(await orgService.updateMemberRole(orgId, memberId, input));
    },
  );

  app.delete(
    "/orgs/:orgId/members/:memberId",
    { preHandler: requireRole(OrgRole.ADMIN, resolveOrgFromParam) },
    async (request, reply) => {
      const { orgId, memberId } = request.params as { orgId: string; memberId: string };
      await orgService.removeMember(orgId, memberId);
      reply.status(204).send();
    },
  );
}
