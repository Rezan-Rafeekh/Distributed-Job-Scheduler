-- AlterTable
ALTER TABLE "dead_letter_entries" ADD COLUMN     "aiSummary" JSONB,
ADD COLUMN     "ai_summary_generated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "job_dependencies" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "depends_on_job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_dependencies_job_id_idx" ON "job_dependencies"("job_id");

-- CreateIndex
CREATE INDEX "job_dependencies_depends_on_job_id_idx" ON "job_dependencies"("depends_on_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_dependencies_job_id_depends_on_job_id_key" ON "job_dependencies"("job_id", "depends_on_job_id");

-- AddForeignKey
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_depends_on_job_id_fkey" FOREIGN KEY ("depends_on_job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
