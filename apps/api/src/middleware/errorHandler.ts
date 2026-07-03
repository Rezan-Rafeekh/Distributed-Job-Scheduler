import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  const requestId = randomUUID();

  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details, requestId },
    });
    return;
  }

  logger.error({ err: error, requestId, url: request.url, method: request.method }, "unhandled error");
  reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId },
  });
}
