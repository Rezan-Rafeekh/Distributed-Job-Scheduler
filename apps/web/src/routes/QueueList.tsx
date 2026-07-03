import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { SkeletonCardList } from "../components/ui/Skeleton.js";
import { useToast } from "../components/ui/Toast.js";

interface Queue {
  id: string;
  name: string;
  description: string | null;
  concurrencyLimit: number;
  priority: number;
  isPaused: boolean;
}

export function QueueList() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: queues, isLoading } = useQuery({
    queryKey: ["queues", projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`),
    refetchInterval: 5000,
  });
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(5);

  const createQueue = useMutation({
    mutationFn: (input: { name: string; priority: number }) =>
      api.post<Queue>(`/projects/${projectId}/queues`, input),
    onSuccess: (queue) => {
      queryClient.invalidateQueries({ queryKey: ["queues", projectId] });
      toast.show(`Queue "${queue.name}" created`);
      setName("");
      setPriority(5);
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to create queue", "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createQueue.mutate({ name: name.trim(), priority });
  }

  return (
    <div>
      <PageHeader title="Queues" subtitle="Configure priority, concurrency, and retry behavior per queue." />

      <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Queue name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. emails"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Priority (0=highest)</label>
          <input
            type="number"
            min={0}
            max={9}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Button type="submit" variant="primary" disabled={createQueue.isPending}>
          Create queue
        </Button>
      </form>

      {isLoading && <SkeletonCardList />}

      <div className="grid gap-3">
        {queues?.map((queue) => (
          <Link key={queue.id} to={`/projects/${projectId}/queues/${queue.id}`}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-5 hover:-translate-y-0.5 hover:shadow-raised">
              <div>
                <div className="flex items-center gap-2 font-medium text-text-primary">
                  {queue.name}
                  {queue.isPaused && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Paused
                    </span>
                  )}
                </div>
                {queue.description && <div className="text-sm text-text-secondary">{queue.description}</div>}
              </div>
              <div className="flex gap-4 text-sm text-text-secondary">
                <span>Priority {queue.priority}</span>
                <span>Concurrency {queue.concurrencyLimit}</span>
              </div>
            </Card>
          </Link>
        ))}
        {queues?.length === 0 && (
          <Card>
            <CardBody className="text-sm text-text-secondary">No queues yet — create one above.</CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
