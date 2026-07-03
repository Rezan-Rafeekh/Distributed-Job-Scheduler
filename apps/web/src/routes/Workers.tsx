import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SkeletonTableRows } from "../components/ui/Skeleton.js";

interface Worker {
  id: string;
  hostname: string;
  pid: number | null;
  status: string;
  concurrency: number;
  currentJobCount: number;
  startedAt: string;
  lastHeartbeatAt: string;
}

export function Workers() {
  const { data: workers, isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.get<Worker[]>("/workers"),
    refetchInterval: 5000,
  });

  return (
    <div>
      <PageHeader title="Workers" subtitle="Live fleet status across every worker process polling this platform." />

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Worker</th>
              <th className="px-5 py-3 font-medium">Host</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Load</th>
              <th className="px-5 py-3 font-medium">Last heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <SkeletonTableRows columns={5} />}
            {workers?.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0 transition-colors hover:bg-beige-50">
                <td className="px-5 py-3 font-mono text-xs text-text-secondary">{w.id.slice(0, 8)}</td>
                <td className="px-5 py-3 text-text-secondary">
                  {w.hostname}
                  {w.pid ? `:${w.pid}` : ""}
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={w.status} />
                </td>
                <td className="px-5 py-3 text-text-secondary">
                  {w.currentJobCount}/{w.concurrency}
                </td>
                <td className="px-5 py-3 text-text-secondary">{new Date(w.lastHeartbeatAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {workers?.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">No workers have registered yet.</p>}
      </Card>
    </div>
  );
}
