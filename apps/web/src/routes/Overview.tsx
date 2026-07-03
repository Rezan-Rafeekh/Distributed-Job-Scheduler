import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "../lib/apiClient.js";
import { useRecentActivity } from "../lib/useRecentActivity.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody, CardHeader } from "../components/ui/Card.js";
import { StatTile } from "../components/ui/StatTile.js";

interface Health {
  jobsByStatus: Record<string, number>;
  workersByStatus: Record<string, number>;
  dlqPending: number;
}

interface ThroughputBucket {
  bucket: string;
  completed: number;
  failed: number;
}

export function Overview() {
  const { projectId } = useParams();

  const { data: health } = useQuery({
    queryKey: ["metrics-health", projectId],
    queryFn: () => api.get<Health>(`/projects/${projectId}/metrics/health`),
    refetchInterval: 8000,
  });
  const { data: throughput } = useQuery({
    queryKey: ["metrics-throughput", projectId],
    queryFn: () => api.get<ThroughputBucket[]>(`/projects/${projectId}/metrics/throughput?hours=24`),
    refetchInterval: 15000,
  });

  const activity = useRecentActivity(projectId);

  const totals = (throughput ?? []).reduce(
    (acc, row) => ({ completed: acc.completed + row.completed, failed: acc.failed + row.failed }),
    { completed: 0, failed: 0 },
  );
  const total = totals.completed + totals.failed;
  const successRate = total > 0 ? Math.round((totals.completed / total) * 100) : 100;
  const chartData = (throughput ?? []).map((row) => ({
    ...row,
    total: row.completed + row.failed,
    label: new Date(row.bucket).toLocaleTimeString([], { hour: "2-digit" }),
  }));

  return (
    <div>
      <PageHeader title="Overview" subtitle="What's happening across this project right now." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Jobs (24h)" value={total} />
        <StatTile label="Success rate %" value={successRate} accent={successRate >= 90 ? "success" : "default"} />
        <StatTile label="Workers online" value={health?.workersByStatus.ONLINE ?? 0} accent="success" />
        <StatTile label="Dead-lettered" value={health?.dlqPending ?? 0} accent={(health?.dlqPending ?? 0) > 0 ? "cherry" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="font-medium">Throughput — last 24 hours</CardHeader>
          <CardBody>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <Area type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2} fill="url(#overviewFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {chartData.length === 0 && (
              <p className="py-6 text-center text-sm text-text-secondary">No execution data yet — create a job to get started.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="font-medium">Live activity</CardHeader>
          <CardBody className="max-h-64 space-y-2 overflow-y-auto">
            {activity.length === 0 && (
              <p className="text-sm text-text-secondary">Watching for job and worker events…</p>
            )}
            {activity.map((entry) => (
              <div key={entry.id} className="animate-fade-in-up flex items-start gap-2 text-xs">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cherry-500" />
                <div>
                  <div className="text-text-primary">{entry.text}</div>
                  <div className="text-text-secondary">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 flex gap-3 text-sm">
        <Link to={`/projects/${projectId}/queues`} className="text-primary hover:underline">
          Manage queues →
        </Link>
        <Link to={`/projects/${projectId}/pipeline`} className="text-primary hover:underline">
          Watch the live pipeline →
        </Link>
      </div>
    </div>
  );
}
