import { prisma } from "@codity/db";
import type { CreateOrgInput, InviteMemberInput, UpdateMemberRoleInput } from "@codity/shared";
import { ConflictError, NotFoundError } from "../lib/errors.js";

export async function createOrg(userId: string, input: CreateOrgInput) {
  const existing = await prisma.organization.findUnique({ where: { slug: input.slug } });
  if (existing) throw new ConflictError("An organization with this slug already exists");

  return prisma.organization.create({
    data: {
      name: input.name,
      slug: input.slug,
      members: { create: { userId, role: "OWNER" } },
    },
  });
}

export async function listOrgsForUser(userId: string) {
  return prisma.organization.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export async function listMembers(orgId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteMember(orgId: string, input: InviteMemberInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new NotFoundError("No user found with that email — they must register first");

  return prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    update: { role: input.role },
    create: { organizationId: orgId, userId: user.id, role: input.role },
  });
}

export async function updateMemberRole(orgId: string, memberId: string, input: UpdateMemberRoleInput) {
  const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId } });
  if (!member) throw new NotFoundError("Membership not found");
  return prisma.organizationMember.update({ where: { id: memberId }, data: { role: input.role } });
}

export async function removeMember(orgId: string, memberId: string) {
  const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId } });
  if (!member) throw new NotFoundError("Membership not found");
  await prisma.organizationMember.delete({ where: { id: memberId } });
}
