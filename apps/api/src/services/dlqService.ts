import { Prisma, prisma } from "@codity/db";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getAnthropicClient } from "../lib/anthropic.js";
import { retryJob } from "./jobService.js";

interface FailureSummary {
  summary: string;
  likelyCause: string;
  suggestedFix: string;
  severity: "low" | "medium" | "high";
}

const FAILURE_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two plain-English sentences describing what went wrong." },
    likelyCause: { type: "string", description: "The most probable root cause, reasoned from the error/logs." },
    suggestedFix: { type: "string", description: "A concrete, actionable next step to resolve or work around it." },
    severity: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "likelyCause", "suggestedFix", "severity"],
  additionalProperties: false,
} as const;

export async function listDlqEntries(projectId: string, resolvedStatus?: string) {
  return prisma.deadLetterEntry.findMany({
    where: {
      resolvedStatus: resolvedStatus ? (resolvedStatus as never) : undefined,
      job: { projectId },
    },
    include: { job: true },
    orderBy: { movedAt: "desc" },
  });
}

export async function requeueFromDlq(jobId: string) {
  return retryJob(jobId);
}

export async function discardFromDlq(jobId: string, userId: string) {
  const entry = await prisma.deadLetterEntry.findUnique({ where: { jobId } });
  if (!entry) throw new NotFoundError("Dead letter entry not found");
  if (entry.resolvedStatus !== "PENDING") {
    throw new ValidationError("This dead letter entry has already been resolved");
  }
  return prisma.deadLetterEntry.update({
    where: { jobId },
    data: { resolvedStatus: "DISCARDED", resolvedAt: new Date(), resolvedByUserId: userId },
  });
}

/**
 * AI-generated failure summary (bonus feature). Single-call classification/
 * summarization use case -- no agent, no tools. Cached onto the DeadLetterEntry
 * so repeat views don't re-call the API; pass `regenerate` to force a fresh call.
 */
export async function generateFailureSummary(jobId: string, regenerate = false): Promise<FailureSummary> {
  const entry = await prisma.deadLetterEntry.findUnique({ where: { jobId } });
  if (!entry) throw new NotFoundError("Dead letter entry not found");

  if (!regenerate && entry.aiSummary) {
    return entry.aiSummary as unknown as FailureSummary;
  }

  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const lastExecution = await prisma.jobExecution.findFirst({
    where: { jobId },
    orderBy: { attemptNumber: "desc" },
    include: { logs: { orderBy: { timestamp: "desc" }, take: 20 } },
  });

  const client = getAnthropicClient();
  const prompt = [
    `A background job in a job scheduler permanently failed (moved to its Dead Letter Queue) after exhausting all retries. Analyze it and explain what went wrong.`,
    ``,
    `Job type: ${job.type}`,
    `Payload: ${JSON.stringify(job.payload)}`,
    `Attempts: ${job.attempts}/${job.maxAttempts}`,
    `Dead-letter reason: ${entry.reason}`,
    `Last error: ${lastExecution?.error ?? job.lastError ?? "(none recorded)"}`,
    lastExecution?.errorStack ? `Stack trace:\n${lastExecution.errorStack}` : "",
    lastExecution?.logs.length
      ? `Recent logs (most recent first):\n${lastExecution.logs.map((l) => `[${l.level}] ${l.message}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: FAILURE_SUMMARY_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  if (!textBlock) throw new Error("AI summary response contained no text content");
  const summary = JSON.parse(textBlock.text) as FailureSummary;

  await prisma.deadLetterEntry.update({
    where: { jobId },
    data: { aiSummary: summary as unknown as Prisma.InputJsonValue, aiSummaryGeneratedAt: new Date() },
  });

  return summary;
}
