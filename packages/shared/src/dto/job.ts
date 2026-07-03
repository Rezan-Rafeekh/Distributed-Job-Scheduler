import { z } from "zod";
import { JobType } from "../enums.js";
import { retryPolicySchema } from "./queue.js";

const baseJobFields = {
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(0).max(9).default(5),
  idempotencyKey: z.string().max(200).optional(),
  retryPolicy: retryPolicySchema.optional(),
  maxAttempts: z.number().int().min(1).max(50).optional(),
  // Workflow dependencies (bonus feature): job(s) that must reach COMPLETED
  // before this one becomes claimable. When present, the job starts SCHEDULED
  // regardless of `type` -- see jobService.createJob and promoteScheduledJobs.ts.
  dependsOnJobIds: z.array(z.string().uuid()).max(20).optional(),
};

export const createJobSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(JobType.IMMEDIATE), ...baseJobFields }),
  z.object({
    type: z.literal(JobType.DELAYED),
    delayMs: z.number().int().positive(),
    ...baseJobFields,
  }),
  z.object({
    type: z.literal(JobType.SCHEDULED),
    runAt: z.coerce.date(),
    ...baseJobFields,
  }),
]);
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const createBatchJobSchema = z.object({
  jobs: z.array(z.object({ payload: z.record(z.unknown()).default({}) })).min(1).max(1000),
  priority: z.number().int().min(0).max(9).default(5),
  retryPolicy: retryPolicySchema.optional(),
  maxAttempts: z.number().int().min(1).max(50).optional(),
});
export type CreateBatchJobInput = z.infer<typeof createBatchJobSchema>;

export const createScheduledJobSchema = z.object({
  name: z.string().min(1).max(120),
  cronExpression: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60).default("UTC"),
  payloadTemplate: z.record(z.unknown()).default({}),
  priority: z.number().int().min(0).max(9).default(5),
  retryPolicy: retryPolicySchema.optional(),
  maxAttempts: z.number().int().min(1).max(50).optional(),
  isActive: z.boolean().default(true),
});
export type CreateScheduledJobInput = z.infer<typeof createScheduledJobSchema>;

export const jobListQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  queueId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
