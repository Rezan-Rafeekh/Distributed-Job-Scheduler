import { WorkerStatus as PrismaWorkerStatus, type PrismaClient } from "@codity/db";
import { logger } from "./logger.js";
import { config } from "./config.js";
import type { PollLoop } from "./pollLoop.js";
import type { HeartbeatLoop } from "./heartbeat.js";
import type { Reconciler } from "./reconciler.js";

/**
 * Graceful shutdown: stop claiming immediately, mark the worker DRAINING so
 * it's visible in the dashboard, wait for in-flight jobs up to a grace
 * period, then force-exit. An abrupt `kill -9` skips all of this and instead
 * relies on the reconciler's stale-claim/dead-worker sweep as the safety net.
 */
export function registerShutdownHandlers(
  db: PrismaClient,
  workerId: string,
  pollLoop: PollLoop,
  heartbeatLoop: HeartbeatLoop,
  reconciler: Reconciler,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown initiated");

    pollLoop.drain();
    reconciler.stop();
    await heartbeatLoop.setStatus("DRAINING").catch((err) => logger.error({ err }, "failed to set DRAINING status"));

    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), config.shutdownGraceMs));
    const drained = pollLoop.waitForInFlight().then(() => "drained" as const);

    const outcome = await Promise.race([drained, timeout]);
    if (outcome === "timeout") {
      logger.warn({ inFlight: pollLoop.inFlightCount }, "shutdown grace period exceeded, exiting with jobs still in flight");
    } else {
      logger.info("all in-flight jobs finished, shutting down cleanly");
    }

    heartbeatLoop.stop();
    await db.worker.update({ where: { id: workerId }, data: { status: PrismaWorkerStatus.OFFLINE } }).catch((err) =>
      logger.error({ err }, "failed to set OFFLINE status on shutdown"),
    );
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
