import { hostname } from "node:os";
import { notify, WorkerStatus as PrismaWorkerStatus, type PrismaClient } from "@codity/db";
import { NOTIFY_CHANNELS, WorkerStatus, type WorkerHeartbeatEvent } from "@codity/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";

export class HeartbeatLoop {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: PrismaClient,
    private readonly workerId: string,
    private readonly concurrency: number,
    private readonly getActiveJobCount: () => number,
  ) {}

  async register(): Promise<void> {
    await this.db.worker.create({
      data: {
        id: this.workerId,
        hostname: hostname(),
        pid: process.pid,
        status: PrismaWorkerStatus.ONLINE,
        concurrency: this.concurrency,
        currentJobCount: 0,
      },
    });
  }

  start(): void {
    this.tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  async setStatus(status: WorkerStatus): Promise<void> {
    await this.db.worker.update({ where: { id: this.workerId }, data: { status } });
  }

  private tick = async (): Promise<void> => {
    try {
      const activeJobCount = this.getActiveJobCount();
      const now = new Date();
      await this.db.worker.update({
        where: { id: this.workerId },
        data: { lastHeartbeatAt: now, currentJobCount: activeJobCount },
      });
      await this.db.workerHeartbeat.create({
        data: { workerId: this.workerId, timestamp: now, activeJobCount },
      });

      const event: WorkerHeartbeatEvent = {
        type: "worker.heartbeat",
        workerId: this.workerId,
        activeJobCount,
        timestamp: now.toISOString(),
      };
      await notify(this.db, NOTIFY_CHANNELS.WORKER_EVENTS, event).catch((err) =>
        logger.warn({ err }, "failed to publish worker.heartbeat event"),
      );
    } catch (err) {
      logger.error({ err }, "heartbeat tick failed");
    }

    this.timer = setTimeout(this.tick, config.heartbeatIntervalMs);
  };
}
