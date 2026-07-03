import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody, CardHeader } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { StatTile } from "../components/ui/StatTile.js";
import { useToast } from "../components/ui/Toast.js";

interface Queue {
  id: string;
  name: string;
  description: string | null;
  concurrencyLimit: number;
  priority: number;
  isPaused: boolean;
}

interface QueueStats {
  byStatus: Record<string, number>;
  completedLastHour: number;
}

interface Job {
  id: string;
  status: string;
  type: string;
  priority: number;
  createdAt: string;
}

type JobType = "IMMEDIATE" | "DELAYED" | "SCHEDULED";

export function QueueDetail() {
  const { projectId, queueId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: queue } = useQuery({
    queryKey: ["queue", queueId],
    queryFn: () => api.get<Queue>(`/queues/${queueId}`),
  });
  const { data: stats } = useQuery({
    queryKey: ["queue-stats", queueId],
    queryFn: () => api.get<QueueStats>(`/queues/${queueId}/stats`),
    refetchInterval: 4000,
  });
  const { data: jobsPage } = useQuery({
    queryKey: ["jobs", "queue", queueId],
    queryFn: () => api.get<{ data: Job[] }>(`/queues/${queueId}/jobs?limit=10`),
    refetchInterval: 4000,
  });

  const [concurrency, setConcurrency] = useState<number | null>(null);
  const [queuePriority, setQueuePriority] = useState<number | null>(null);

  const togglePause = useMutation({
    mutationFn: () => api.post(`/queues/${queueId}/${queue?.isPaused ? "resume" : "pause"}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", queueId] });
      toast.show(queue?.isPaused ? "Queue resumed" : "Queue paused");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to update queue", "error"),
  });

  const updateQueue = useMutation({
    mutationFn: (input: { concurrencyLimit?: number; priority?: number }) => api.patch(`/queues/${queueId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", queueId] });
      toast.show("Configuration saved");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to save configuration", "error"),
  });

  function onSubmitConfig(e: FormEvent) {
    e.preventDefault();
    updateQueue.mutate({
      concurrencyLimit: concurrency ?? undefined,
      priority: queuePriority ?? undefined,
    });
  }

  // --- Create job form ---
  const [jobType, setJobType] = useState<JobType>("IMMEDIATE");
  const [payloadText, setPayloadText] = useState('{\n  "handler": "echo"\n}');
  const [jobPriority, setJobPriority] = useState(5);
  const [delayMs, setDelayMs] = useState(60000);
  const [runAt, setRunAt] = useState("");
  const [dependsOnText, setDependsOnText] = useState("");
  const [createJobError, setCreateJobError] = useState<string | null>(null);

  const createJob = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/queues/${queueId}/jobs`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "queue", queueId] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats", queueId] });
      setCreateJobError(null);
      toast.show("Job created");
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to create job";
      setCreateJobError(message);
      toast.show(message, "error");
    },
  });

  function onSubmitCreateJob(e: FormEvent) {
    e.preventDefault();
    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setCreateJobError("Payload must be valid JSON");
      return;
    }
    const dependsOnJobIds = dependsOnText
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const base = {
      type: jobType,
      payload,
      priority: jobPriority,
      ...(dependsOnJobIds.length > 0 ? { dependsOnJobIds } : {}),
    };
    if (jobType === "DELAYED") {
      createJob.mutate({ ...base, delayMs });
    } else if (jobType === "SCHEDULED") {
      createJob.mutate({ ...base, runAt: runAt ? new Date(runAt).toISOString() : new Date().toISOString() });
    } else {
      createJob.mutate(base);
    }
  }

  if (!queue) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={queue.name}
        subtitle={queue.description ?? undefined}
        actions={
          <Button variant={queue.isPaused ? "primary" : "danger"} onClick={() => togglePause.mutate()}>
            {queue.isPaused ? "Resume queue" : "Pause queue"}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(stats?.byStatus ?? {}).map(([status, count]) => (
          <div key={status} className="space-y-2">
            <StatTile label={status.replace(/_/g, " ")} value={count} />
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="font-medium">Configuration</CardHeader>
          <CardBody>
            <form onSubmit={onSubmitConfig} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-text-secondary">Concurrency limit</label>
                <input
                  type="number"
                  min={1}
                  defaultValue={queue.concurrencyLimit}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-text-secondary">Priority (0=highest)</label>
                <input
                  type="number"
                  min={0}
                  max={9}
                  defaultValue={queue.priority}
                  onChange={(e) => setQueuePriority(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button type="submit" disabled={updateQueue.isPending}>
                Save
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between font-medium">
            Recent jobs
            <Link to={`/projects/${projectId}/jobs?queueId=${queueId}`} className="text-xs font-normal text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody className="divide-y divide-border p-0">
            {jobsPage?.data.map((job) => (
              <Link
                key={job.id}
                to={`/projects/${projectId}/jobs/${job.id}`}
                className="flex items-center justify-between px-5 py-2.5 text-sm transition-colors hover:bg-beige-50"
              >
                <span className="font-mono text-xs text-text-secondary">{job.id.slice(0, 8)}</span>
                <StatusPill status={job.status} />
              </Link>
            ))}
            {jobsPage?.data.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">No jobs yet.</p>}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="font-medium">Create job</CardHeader>
        <CardBody>
          <form onSubmit={onSubmitCreateJob} className="grid gap-3 sm:grid-cols-2">
            {createJobError && (
              <p className="sm:col-span-2 rounded-lg bg-cherry-50 px-3 py-2 text-sm text-cherry-700">{createJobError}</p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Type</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as JobType)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="IMMEDIATE">Immediate</option>
                <option value="DELAYED">Delayed</option>
                <option value="SCHEDULED">Scheduled</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Priority (0=highest)</label>
              <input
                type="number"
                min={0}
                max={9}
                value={jobPriority}
                onChange={(e) => setJobPriority(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            {jobType === "DELAYED" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}
            {jobType === "SCHEDULED" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Run at</label>
                <input
                  type="datetime-local"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Payload (JSON — try <code className="font-mono">{"{\"handler\":\"fail-always\"}"}</code> to see retry/DLQ)
              </label>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Depends on job IDs — comma-separated (workflow dependencies bonus feature; this job waits until
                all listed jobs reach COMPLETED)
              </label>
              <input
                value={dependsOnText}
                onChange={(e) => setDependsOnText(e.target.value)}
                placeholder="e.g. 3f9b1c2a-…, 7a02e5d1-…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" disabled={createJob.isPending}>
                Create job
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
