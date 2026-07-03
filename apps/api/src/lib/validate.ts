import type { z, ZodTypeAny } from "zod";
import { ValidationError } from "./errors.js";

export function parseOrThrow<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Request validation failed", result.error.flatten());
  }
  return result.data as z.infer<S>;
}
