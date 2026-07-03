import { z } from "zod";
import { RetryStrategy } from "../enums.js";

export const retryPolicySchema = z.object({
  name: z.string().min(1).max(120),
  strategy: z.nativeEnum(RetryStrategy),
  baseDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().min(0).max(50).default(5),
  jitter: z.boolean().default(true),
});
export type RetryPolicyDto = z.infer<typeof retryPolicySchema>;

export const createQueueSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  concurrencyLimit: z.number().int().positive().max(1000).default(5),
  // Queue-level priority (lower = higher priority, same convention as job priority):
  // when one worker sees multiple unpaused queues, higher-priority queues get
  // first crack at its free capacity each poll tick.
  priority: z.number().int().min(0).max(9).default(5),
  defaultRetryPolicy: retryPolicySchema.optional(),
});
export type CreateQueueInput = z.infer<typeof createQueueSchema>;

export const updateQueueSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  concurrencyLimit: z.number().int().positive().max(1000).optional(),
  priority: z.number().int().min(0).max(9).optional(),
});
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
