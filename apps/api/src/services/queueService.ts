import { prisma } from "@codity/db";
import type { CreateQueueInput, UpdateQueueInput } from "@codity/shared";
import { ConflictError, NotFoundError } from "../lib/errors.js";

export async function createQueue(projectId: string, input: CreateQueueInput) {
  const existing = await prisma.queue.findUnique({
    where: { projectId_name: { projectId, name: input.name } },
  });
  if (existing) throw new ConflictError("A queue with this name already exists in this project");

  let defaultRetryPolicyId: string | undefined;
  if (input.defaultRetryPolicy) {
    const policy = await prisma.retryPolicy.create({ data: input.defaultRetryPolicy });
    defaultRetryPolicyId = policy.id;
  }

  return prisma.queue.create({
    data: {
      projectId,
      name: input.name,
      description: input.description,
      concurrencyLimit: input.concurrencyLimit,
      priority: input.priority,
      defaultRetryPolicyId,
    },
    include: { defaultRetryPolicy: true },
  });
}

export async function listQueues(projectId: string) {
  return prisma.queue.findMany({
    where: { projectId },
    include: { defaultRetryPolicy: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQueue(queueId: string) {
  const queue = await prisma.queue.findUnique({ where: { id: queueId }, include: { defaultRetryPolicy: true } });
  if (!queue) throw new NotFoundError("Queue not found");
  return queue;
}

export async function updateQueue(queueId: string, input: UpdateQueueInput) {
  await getQueue(queueId);
  return prisma.queue.update({ where: { id: queueId }, data: input });
}

export async function deleteQueue(queueId: string) {
  await getQueue(queueId);
  await prisma.queue.delete({ where: { id: queueId } });
}

export async function setPaused(queueId: string, isPaused: boolean) {
  await getQueue(queueId);
  return prisma.queue.update({ where: { id: queueId }, data: { isPaused } });
}

export async function getQueueStats(queueId: string) {
  await getQueue(queueId);
  const [statusCounts, recentCompleted] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { queueId }, _count: { _all: true } }),
    prisma.job.count({
      where: { queueId, status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all]));
  return { byStatus, completedLastHour: recentCompleted };
}
