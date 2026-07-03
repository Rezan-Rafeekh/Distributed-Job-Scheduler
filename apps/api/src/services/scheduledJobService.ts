import parser from "cron-parser";
import { Prisma, prisma } from "@codity/db";
import type { CreateScheduledJobInput } from "@codity/shared";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getQueue } from "./queueService.js";

export async function createScheduledJob(queueId: string, input: CreateScheduledJobInput) {
  await getQueue(queueId);

  let nextRunAt: Date;
  try {
    nextRunAt = parser.parseExpression(input.cronExpression, { tz: input.timezone }).next().toDate();
  } catch {
    throw new ValidationError(`Invalid cron expression: "${input.cronExpression}"`);
  }

  let retryPolicyId: string | undefined;
  if (input.retryPolicy) {
    const policy = await prisma.retryPolicy.create({ data: input.retryPolicy });
    retryPolicyId = policy.id;
  }

  return prisma.scheduledJob.create({
    data: {
      queueId,
      name: input.name,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      payloadTemplate: input.payloadTemplate as Prisma.InputJsonValue,
      priority: input.priority,
      maxAttempts: input.maxAttempts ?? 5,
      retryPolicyId,
      isActive: input.isActive,
      nextRunAt,
    },
  });
}

export async function listScheduledJobs(queueId: string) {
  return prisma.scheduledJob.findMany({ where: { queueId }, orderBy: { createdAt: "desc" } });
}

export async function getScheduledJob(id: string) {
  const scheduled = await prisma.scheduledJob.findUnique({ where: { id } });
  if (!scheduled) throw new NotFoundError("Scheduled job not found");
  return scheduled;
}

export async function updateScheduledJob(
  id: string,
  input: Partial<Pick<CreateScheduledJobInput, "isActive" | "cronExpression" | "priority" | "payloadTemplate">>,
) {
  const existing = await getScheduledJob(id);
  const data: Record<string, unknown> = { ...input };

  if (input.cronExpression) {
    try {
      data.nextRunAt = parser
        .parseExpression(input.cronExpression, { tz: existing.timezone })
        .next()
        .toDate();
    } catch {
      throw new ValidationError(`Invalid cron expression: "${input.cronExpression}"`);
    }
  }

  return prisma.scheduledJob.update({ where: { id }, data });
}

export async function deleteScheduledJob(id: string) {
  await getScheduledJob(id);
  await prisma.scheduledJob.delete({ where: { id } });
}
