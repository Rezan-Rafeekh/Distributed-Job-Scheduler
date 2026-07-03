import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SkeletonTableRows } from "../components/ui/Skeleton.js";

interface Job {
  id: string;
  queueId: string;
  status: string;
  type: string;
  priority: number;
  attempts: number;
  createdAt: string;
}

interface JobPage {
  data: Job[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

const STATUSES = ["", "QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "COMPLETED", "DEAD_LETTER", "CANCELLED"];

export function JobExplorer() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const queueId = searchParams.get("queueId") ?? undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", "global", projectId, status, queueId, cursor],
    queryFn: () =>
      api.get<JobPage>(
        `/jobs?projectId=${projectId}&limit=25${status ? `&status=${status}` : ""}${queueId ? `&queueId=${queueId}` : ""}${cursor ? `&cursor=${cursor}` : ""}`,
      ),
    refetchInterval: 5000,
  });

  return (
    <div>
      <PageHeader title="Job Explorer" subtitle="Browse and filter every job across this project's queues." />

      <div className="mb-4 flex gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(undefined);
          }}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Job</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Priority</th>
              <th className="px-5 py-3 font-medium">Attempts</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <SkeletonTableRows columns={6} />}
            {data?.data.map((job) => (
              <tr key={job.id} className="border-b border-border last:border-0 transition-colors hover:bg-beige-50">
                <td className="px-5 py-3">
                  <Link to={`/projects/${projectId}/jobs/${job.id}`} className="font-mono text-xs text-primary hover:underline">
                    {job.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-5 py-3 text-text-secondary">{job.type}</td>
                <td className="px-5 py-3">
                  <StatusPill status={job.status} />
                </td>
                <td className="px-5 py-3 text-text-secondary">{job.priority}</td>
                <td className="px-5 py-3 text-text-secondary">{job.attempts}</td>
                <td className="px-5 py-3 text-text-secondary">{new Date(job.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {data?.data.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">No jobs match this filter.</p>}
      </Card>

      {data?.pagination.hasMore && (
        <button
          onClick={() => setCursor(data.pagination.nextCursor!)}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Load more
        </button>
      )}
    </div>
  );
}
