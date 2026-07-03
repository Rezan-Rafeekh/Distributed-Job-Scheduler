import { prisma } from "@codity/db";
import { NotFoundError } from "../lib/errors.js";

export async function listWorkers() {
  return prisma.worker.findMany({ orderBy: { lastHeartbeatAt: "desc" } });
}

export async function getWorker(workerId: string) {
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker) throw new NotFoundError("Worker not found");
  return worker;
}

export async function getWorkerHeartbeats(workerId: string, limit = 50) {
  await getWorker(workerId);
  return prisma.workerHeartbeat.findMany({
    where: { workerId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}
