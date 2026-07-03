import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardBody, CardHeader } from "../components/ui/Card.js";

interface ThroughputBucket {
  bucket: string;
  completed: number;
  failed: number;
}

interface Health {
  jobsByStatus: Record<string, number>;
  workersByStatus: Record<string, number>;
  dlqPending: number;
}

// Both are CSS vars (see theme.css) with independently-tuned light/dark
// values, so contrast against the chart surface holds in either mode.
const COLOR_COMPLETED = "var(--color-success)";
const COLOR_FAILED = "var(--color-cherry-500)";

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      <div className="text-xs text-text-secondary">{label}</div>
    </Card>
  );
}

export function Metrics() {
  const { projectId } = useParams();

  const { data: throughput } = useQuery({
    queryKey: ["metrics-throughput", projectId],
    queryFn: () => api.get<ThroughputBucket[]>(`/projects/${projectId}/metrics/throughput?hours=24`),
    refetchInterval: 15000,
  });
  const { data: health } = useQuery({
    queryKey: ["metrics-health", projectId],
    queryFn: () => api.get<Health>(`/projects/${projectId}/metrics/health`),
    refetchInterval: 10000,
  });

  const chartData = (throughput ?? []).map((row) => ({
    ...row,
    label: new Date(row.bucket).toLocaleTimeString([], { hour: "2-digit" }),
  }));

  return (
    <div>
      <PageHeader title="Metrics" subtitle="Throughput and system health for this project." />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Running" value={health?.jobsByStatus.RUNNING ?? 0} />
        <StatTile label="Queued" value={health?.jobsByStatus.QUEUED ?? 0} />
        <StatTile label="Dead-lettered (pending)" value={health?.dlqPending ?? 0} />
        <StatTile label="Workers online" value={health?.workersByStatus.ONLINE ?? 0} />
      </div>

      <Card>
        <CardHeader className="font-medium">Throughput — last 24 hours</CardHeader>
        <CardBody>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completed" name="Completed" fill={COLOR_COMPLETED} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="failed" name="Failed" fill={COLOR_FAILED} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {chartData.length === 0 && (
            <p className="py-6 text-center text-sm text-text-secondary">No execution data in this window yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
