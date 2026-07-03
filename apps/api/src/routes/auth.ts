import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSchema, registerSchema } from "@codity/shared";
import { parseOrThrow } from "../lib/validate.js";
import * as authService from "../services/authService.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const input = parseOrThrow(registerSchema, request.body);
    const result = await authService.register(input);
    reply.status(201).send(result);
  });

  app.post("/auth/login", async (request, reply) => {
    const input = parseOrThrow(loginSchema, request.body);
    const result = await authService.login(input);
    reply.send(result);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const input = parseOrThrow(refreshSchema, request.body);
    const result = await authService.refresh(input.refreshToken);
    reply.send(result);
  });

  app.post("/auth/logout", async (_request, reply) => {
    // Stateless JWTs: logout is a client-side token discard. Documented as a
    // known trade-off in design-decisions.md (no server-side revocation list).
    reply.status(204).send();
  });
}
