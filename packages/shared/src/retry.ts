import { RetryStrategy } from "./enums.js";

export interface RetryPolicyInput {
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs?: number | null;
  jitter: boolean;
}

/**
 * attempt is 1-indexed: the delay to apply *before* this attempt runs
 * (i.e. attempt=1 is the delay before the first retry, following the initial failed try).
 */
export function computeRetryDelayMs(
  policy: RetryPolicyInput,
  attempt: number,
  random: () => number = Math.random,
): number {
  if (attempt < 1) {
    throw new RangeError(`attempt must be >= 1, got ${attempt}`);
  }

  let delay: number;
  switch (policy.strategy) {
    case RetryStrategy.FIXED:
      delay = policy.baseDelayMs;
      break;
    case RetryStrategy.LINEAR:
      delay = policy.baseDelayMs * attempt;
      break;
    case RetryStrategy.EXPONENTIAL:
      delay = policy.baseDelayMs * 2 ** (attempt - 1);
      break;
    default:
      throw new Error(`Unknown retry strategy: ${policy.strategy satisfies never}`);
  }

  if (policy.maxDelayMs != null) {
    delay = Math.min(delay, policy.maxDelayMs);
  }

  if (policy.jitter) {
    // scale into [0.5, 1.0] of the computed delay to avoid thundering-herd retries
    const jitterFactor = 0.5 + random() * 0.5;
    delay = Math.round(delay * jitterFactor);
  }

  return delay;
}

export function computeNextRunAt(
  policy: RetryPolicyInput,
  attempt: number,
  now: Date = new Date(),
  random: () => number = Math.random,
): Date {
  const delayMs = computeRetryDelayMs(policy, attempt, random);
  return new Date(now.getTime() + delayMs);
}
