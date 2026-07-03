import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@codity/db";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { PollLoop } from "./pollLoop.js";
import { HeartbeatLoop } from "./heartbeat.js";
import { Reconciler } from "./reconciler.js";
import { registerShutdownHandlers } from "./shutdown.js";

async function main() {
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
