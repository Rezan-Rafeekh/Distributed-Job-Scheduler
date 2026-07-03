export interface JobHandlerContext {
  jobId: string;
  attempt: number;
  log: (level: "debug" | "info" | "warn" | "error", message: string, metadata?: unknown) => void;
}

export type JobHandler = (payload: Record<string, unknown>, ctx: JobHandlerContext) => Promise<unknown>;
