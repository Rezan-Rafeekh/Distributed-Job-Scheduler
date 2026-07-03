import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { useToast } from "../components/ui/Toast.js";

interface Queue {
  id: string;
  name: string;
}

interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  nextRunAt: string;
}

export function Scheduled() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: queues } = useQuery({
    queryKey: ["queues", projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`),
  });
  const [queueId, setQueueId] = useState<string>("");
  const activeQueueId = queueId || queues?.[0]?.id;

  const { data: scheduledJobs } = useQuery({
    queryKey: ["scheduled-jobs", activeQueueId],
    queryFn: () => api.get<ScheduledJob[]>(`/queues/${activeQueueId}/scheduled-jobs`),
    enabled: !!activeQueueId,
    refetchInterval: 10000,
  });

  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/queues/${activeQueueId}/scheduled-jobs`, {
        name,
        cronExpression: cron,
        payloadTemplate: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-jobs", activeQueueId] });
      setName("");
      toast.show("Schedule created");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to create schedule", "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeQueueId) return;
    create.mutate();
  }

  return (
    <div>
      <PageHeader title="Scheduled Jobs" subtitle="Cron templates that materialize into new jobs on schedule." />

      <div className="mb-6 flex items-center gap-2">
        <label className="text-sm text-text-secondary">Queue</label>
        <select
          value={activeQueueId ?? ""}
          onChange={(e) => setQueueId(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
        >
          {queues?.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
        />
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="Cron expression"
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-mono"
        />
        <Button type="submit" variant="primary" disabled={create.isPending}>
          Create schedule
        </Button>
      </form>

      <div className="grid gap-3">
        {scheduledJobs?.map((sj) => (
          <Card key={sj.id} className="flex flex-wrap items-center justify-between gap-2 p-5">
            <div>
              <div className="font-medium text-text-primary">{sj.name}</div>
              <div className="font-mono text-xs text-text-secondary">
                {sj.cronExpression} ({sj.timezone})
              </div>
            </div>
            <div className="text-sm text-text-secondary">Next run {new Date(sj.nextRunAt).toLocaleString()}</div>
          </Card>
        ))}
        {scheduledJobs?.length === 0 && (
          <Card>
            <CardBody className="text-sm text-text-secondary">No scheduled jobs for this queue yet.</CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
