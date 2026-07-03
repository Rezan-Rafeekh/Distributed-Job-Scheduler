import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SkeletonCardList } from "../components/ui/Skeleton.js";
import { useToast } from "../components/ui/Toast.js";

interface DlqEntry {
  id: string;
  jobId: string;
  reason: string;
  movedAt: string;
  resolvedStatus: string;
  job: { id: string; type: string; queueId: string };
}

export function Dlq() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["dlq", projectId],
    queryFn: () => api.get<DlqEntry[]>(`/dlq?projectId=${projectId}&resolvedStatus=PENDING`),
    refetchInterval: 5000,
  });

  const requeue = useMutation({
    mutationFn: (jobId: string) => api.post(`/dlq/${jobId}/requeue`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dlq", projectId] });
      toast.show("Job requeued");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to requeue job", "error"),
  });
  const discard = useMutation({
    mutationFn: (jobId: string) => api.post(`/dlq/${jobId}/discard`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dlq", projectId] });
      toast.show("Entry discarded", "info");
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Failed to discard entry", "error"),
  });

  return (
    <div>
      <PageHeader title="Dead Letter Queue" subtitle="Jobs that exhausted every retry attempt." />

      {isLoading && <SkeletonCardList />}

      <div className="grid gap-3">
        {entries?.map((entry) => (
          <Card key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-5 hover:-translate-y-0.5 hover:shadow-raised">
            <Link to={`/projects/${projectId}/jobs/${entry.jobId}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-secondary">{entry.jobId.slice(0, 8)}</span>
                <StatusPill status={entry.resolvedStatus} />
              </div>
              <p className="mt-1 max-w-xl truncate text-sm text-cherry-700">{entry.reason}</p>
              <p className="text-xs text-text-secondary">Moved {new Date(entry.movedAt).toLocaleString()}</p>
            </Link>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => requeue.mutate(entry.jobId)} disabled={requeue.isPending}>
                Requeue
              </Button>
              <Button variant="danger" onClick={() => discard.mutate(entry.jobId)} disabled={discard.isPending}>
                Discard
              </Button>
            </div>
          </Card>
        ))}
        {entries?.length === 0 && (
          <Card className="p-5 text-sm text-text-secondary">Nothing in the dead letter queue right now.</Card>
        )}
      </div>
    </div>
  );
}
