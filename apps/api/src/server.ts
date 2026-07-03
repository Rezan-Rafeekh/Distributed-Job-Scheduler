import "dotenv/config";
import "./lib/bigintJson.js";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./lib/logger.js";
import { authRoutes } from "./routes/auth.js";
import { orgRoutes } from "./routes/org.js";
import { projectRoutes } from "./routes/project.js";
import { queueRoutes } from "./routes/queue.js";
import { jobRoutes } from "./routes/job.js";
import { scheduledJobRoutes } from "./routes/scheduledJob.js";
import { workerRoutes } from "./routes/worker.js";
import { dlqRoutes } from "./routes/dlq.js";
import { metricsRoutes } from "./routes/metrics.js";
import { registerWebSocketGateway } from "./ws/gateway.js";

export async function buildServer() {
  const app = Fastify({ loggerInstance: logger });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(websocket);
  await app.register(swagger, {
    openapi: {
      info: { title: "Codity Job Scheduler API", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler(errorHandler);

  await app.register(async (api) => {
    // Auth endpoints get a tighter rate limit than the global default —
    // brute-force login/registration attempts should not get 100 req/min.
    await api.register(async (auth) => {
      auth.addHook("onRoute", (route) => {
        route.config = {
          ...route.config,
          rateLimit: { max: 10, timeWindow: "1 minute" },
        };
      });
      await auth.register(authRoutes);
    });

    await api.register(orgRoutes);
    await api.register(projectRoutes);
    await api.register(queueRoutes);
    await api.register(jobRoutes);
    await api.register(scheduledJobRoutes);
    await api.register(workerRoutes);
    await api.register(dlqRoutes);
    await api.register(metricsRoutes);
    await registerWebSocketGateway(api);
  }, { prefix: "/api" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${port} (docs at /docs)`);
}

// Only auto-start when this file is run directly (`node server.js` / `tsx server.ts`),
// not when `buildServer` is imported by tests — otherwise every test file
// importing this module would also try to bind a real port.
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  start().catch((err) => {
    logger.error({ err }, "API failed to start");
    process.exit(1);
  });
}
