import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { useToast } from "../components/ui/Toast.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody, CardHeader } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { JobDependencyGraph } from "../components/JobDependencyGraph.js";

interface FailureSummary {
  summary: string;
  likelyCause: string;
  suggestedFix: string;
  severity: "low" | "medium" | "high";
}

interface DlqEntry {
  reason: string;
  aiSummary: FailureSummary | null;
  aiSummaryGeneratedAt: string | null;
}

interface Job {
  id: string;
  queueId: string;
  status: string;
  type: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
  result: unknown;
  lastError: string | null;
  runAt: string;
  createdAt: string;
  completedAt: string | null;
  dlqEntry: DlqEntry | null;
}

interface Execution {
  id: string;
  attemptNumber: number;
  workerId: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

const SEVERITY_STYLES: Record<FailureSummary["severity"], string> = {
  low: "bg-beige-100 text-beige-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-cherry-100 text-cherry-800",
};

export function JobDetail() {
  const { jobId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);

  const { data: job } = useQuery({ queryKey: ["job", jobId], queryFn: () => api.get<Job>(`/jobs/${jobId}`), refetchInterval: 3000 });
  const { data: executions } = useQuery({
    queryKey: ["job-executions", jobId],
    queryFn: () => api.get<Execution[]>(`/jobs/${jobId}/executions`),
    refetchInterval: 3000,
  });
  const { data: logs } = useQuery({
    queryKey: ["job-logs", jobId, expandedExecution],
    queryFn: () => api.get<LogEntry[]>(`/jobs/${jobId}/executions/${expandedExecution}/logs`),
    enabled: !!expandedExecution,
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast.show("Job cancelled");
    },
    onError: (err: Error) => toast.show(err.message, "error"),
  });
  const retry = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast.show("Job re-queued");
    },
    onError: (err: Error) => toast.show(err.message, "error"),
  });
  const aiSummary = useMutation({
    mutationFn: (regenerate: boolean) => api.post<FailureSummary>(`/dlq/${jobId}/ai-summary`, { regenerate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast.show("AI failure analysis ready");
    },
    onError: (err: Error) => toast.show(err.message, "error"),
  });

  if (!job) return <p className="text-sm text-text-secondary">Loading…</p>;

  const canCancel = ["QUEUED", "SCHEDULED", "CLAIMED"].includes(job.status);
  const canRetry = job.status === "DEAD_LETTER";

  return (
    <div>
      <PageHeader
        title={`Job ${job.id.slice(0, 8)}`}
        subtitle={`${job.type} · attempt ${job.attempts}/${job.maxAttempts}`}
        actions={
          <>
            {canRetry && (
              <Button variant="primary" onClick={() => retry.mutate()} disabled={retry.isPending}>
                Retry job
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex items-center gap-4">
        <StatusPill status={job.status} />
        <span className="text-sm text-text-secondary">Priority {job.priority}</span>
        <span className="text-sm text-text-secondary">Runs at {new Date(job.runAt).toLocaleString()}</span>
      </div>

      {job.lastError && (
        <Card className="mb-6 border-cherry-200 bg-cherry-50">
          <CardBody className="text-sm text-cherry-800">
            <span className="font-medium">Last error: </span>
            {job.lastError}
          </CardBody>
        </Card>
      )}

      {job.status === "DEAD_LETTER" && (
        <Card className="mb-6 border-l-4 border-l-cherry-500 bg-hero-gradient">
          <CardHeader className="flex items-center justify-between font-medium">
            <span className="font-display">AI Failure Analysis</span>
            {job.dlqEntry?.aiSummary && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => aiSummary.mutate(true)}
                disabled={aiSummary.isPending}
              >
                {aiSummary.isPending ? "Regenerating…" : "Regenerate"}
              </Button>
            )}
          </CardHeader>
          <CardBody>
            {!job.dlqEntry?.aiSummary ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-text-secondary">
                  Ask AI to read this job's execution logs and stack trace and summarize what went wrong.
                </p>
                <Button variant="primary" onClick={() => aiSummary.mutate(false)} disabled={aiSummary.isPending}>
                  {aiSummary.isPending ? "Analyzing…" : "Generate analysis"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[job.dlqEntry.aiSummary.severity]}`}
                  >
                    {job.dlqEntry.aiSummary.severity} severity
                  </span>
                  {job.dlqEntry.aiSummaryGeneratedAt && (
                    <span className="text-xs text-text-secondary">
                      Generated {new Date(job.dlqEntry.aiSummaryGeneratedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-text-primary">{job.dlqEntry.aiSummary.summary}</p>
                <div>
                  <span className="font-medium text-text-primary">Likely cause: </span>
                  <span className="text-text-secondary">{job.dlqEntry.aiSummary.likelyCause}</span>
                </div>
                <div>
                  <span className="font-medium text-text-primary">Suggested fix: </span>
                  <span className="text-text-secondary">{job.dlqEntry.aiSummary.suggestedFix}</span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="font-medium">Payload</CardHeader>
          <CardBody>
            <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-beige-100">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="font-medium">Result</CardHeader>
          <CardBody>
            <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-beige-100">
              {job.result ? JSON.stringify(job.result, null, 2) : "—"}
            </pre>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="font-medium">Execution / retry history</CardHeader>
        <CardBody className="divide-y divide-border p-0">
          {executions?.map((exec) => (
            <div key={exec.id}>
              <button
                onClick={() => setExpandedExecution(expandedExecution === exec.id ? null : exec.id)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-beige-50"
              >
                <span className="font-medium text-text-primary">Attempt {exec.attemptNumber}</span>
                <span className="text-text-secondary">{exec.workerId?.slice(0, 8) ?? "—"}</span>
                <span className="text-text-secondary">{exec.durationMs != null ? `${exec.durationMs}ms` : "—"}</span>
                <StatusPill status={exec.status} />
              </button>
              {expandedExecution === exec.id && (
                <div className="bg-ink-900 px-5 py-3">
                  {exec.error && <p className="mb-2 font-mono text-xs text-cherry-300">{exec.error}</p>}
                  {logs?.map((log) => (
                    <div key={log.id} className="font-mono text-xs text-beige-100">
                      <span className="text-ink-400">{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
                      <span className="text-amber-300">[{log.level}]</span> {log.message}
                    </div>
                  ))}
                  {logs?.length === 0 && <p className="font-mono text-xs text-ink-400">No logs for this attempt.</p>}
                </div>
              )}
            </div>
          ))}
          {executions?.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">No executions yet.</p>}
        </CardBody>
      </Card>

      <JobDependencyGraph jobId={job.id} jobStatus={job.status} />
    </div>
  );
}
