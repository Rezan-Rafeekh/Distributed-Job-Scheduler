import { prisma } from "@codity/db";
import type { CreateProjectInput, UpdateProjectInput } from "@codity/shared";
import { ConflictError, NotFoundError } from "../lib/errors.js";

export async function createProject(orgId: string, input: CreateProjectInput) {
  const existing = await prisma.project.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: input.name } },
  });
  if (existing) throw new ConflictError("A project with this name already exists in this organization");

  return prisma.project.create({ data: { organizationId: orgId, ...input } });
}

export async function listProjects(orgId: string) {
  return prisma.project.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } });
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

export async function updateProject(projectId: string, input: UpdateProjectInput) {
  await getProject(projectId);
  return prisma.project.update({ where: { id: projectId }, data: input });
}

export async function deleteProject(projectId: string) {
  await getProject(projectId);
  await prisma.project.delete({ where: { id: projectId } });
}
