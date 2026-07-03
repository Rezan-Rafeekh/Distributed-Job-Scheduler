import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { prisma } from "@codity/db";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { PollLoop } from "./pollLoop.js";
import { HeartbeatLoop } from "./heartbeat.js";
import { Reconciler } from "./reconciler.js";
import { registerShutdownHandlers } from "./shutdown.js";

/**
 * The worker has no HTTP surface of its own -- this exists only so hosts that
 * require a bound port for health checks (e.g. Render's free tier has no
 * "background worker" service type; a worker has to masquerade as a web
 * service) have something to probe. Not used by any client of this platform.
 */
function startHealthServer(): void {
  const port = process.env.PORT;
  if (!port) return;
  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  }).listen(Number(port), "0.0.0.0", () => {
    logger.info({ port }, "worker health server listening");
  });
}

async function main() {
  startHealthServer();
  const workerId = randomUUID();
  const pollLoop = new PollLoop(prisma, workerId, config.concurrency);
  const heartbeatLoop = new HeartbeatLoop(prisma, workerId, config.concurrency, () => pollLoop.inFlightCount);
  const reconciler = new Reconciler(prisma);

  await heartbeatLoop.register();
  logger.info({ workerId, concurrency: config.concurrency }, "worker registered, starting loops");

  registerShutdownHandlers(prisma, workerId, pollLoop, heartbeatLoop, reconciler);

  heartbeatLoop.start();
  reconciler.start();
  pollLoop.start();
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
