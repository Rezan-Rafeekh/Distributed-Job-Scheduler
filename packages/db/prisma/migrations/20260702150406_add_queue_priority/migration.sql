-- AlterTable
ALTER TABLE "queues" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 5;

-- CreateIndex
CREATE INDEX "queues_project_id_priority_idx" ON "queues"("project_id", "priority");
