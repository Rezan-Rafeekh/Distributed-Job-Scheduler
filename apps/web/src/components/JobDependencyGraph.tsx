import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";
import { Card, CardBody, CardHeader } from "./ui/Card.js";
import { StatusPill } from "./ui/StatusPill.js";

interface DependencyJob {
  id: string;
  status: string;
  type: string;
}

interface DependencyGraph {
  dependencies: DependencyJob[];
  dependents: DependencyJob[];
}

const ROW_HEIGHT = 56;
const NODE_X = { deps: 40, center: 260, dependents: 480 };

function nodeY(index: number, count: number): number {
  return count <= 1 ? 20 + ROW_HEIGHT : 20 + index * ROW_HEIGHT;
}

export function JobDependencyGraph({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
  const { projectId } = useParams();
  const { data } = useQuery({
    queryKey: ["job-dependencies", jobId],
    queryFn: () => api.get<DependencyGraph>(`/jobs/${jobId}/dependencies`),
  });

  if (!data || (data.dependencies.length === 0 && data.dependents.length === 0)) return null;

  const rows = Math.max(data.dependencies.length, data.dependents.length, 1);
  const height = rows * ROW_HEIGHT + 40;
  const centerY = height / 2;

  return (
    <Card className="mt-6">
      <CardHeader className="font-medium">Dependency graph</CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          {/* Explicit height on the positioning context: absolutely-positioned
              children (the SVG overlay + HTML nodes below) don't contribute to
              a parent's intrinsic height, so without this the card collapses
              to zero height despite rendering real content. */}
          <div className="relative w-[560px]" style={{ height }}>
            <svg width={560} height={height} className="absolute left-0 top-0 min-w-[560px]">
              {data.dependencies.map((dep, i) => (
                <path
                  key={`dep-path-${dep.id}`}
                  d={`M ${NODE_X.deps + 90} ${nodeY(i, data.dependencies.length)} C ${NODE_X.center - 60} ${nodeY(i, data.dependencies.length)}, ${NODE_X.center - 60} ${centerY}, ${NODE_X.center - 8} ${centerY}`}
                  fill="none"
                  stroke="var(--color-beige-300)"
                  strokeWidth={2}
                  className="animate-fade-in-up"
                />
              ))}
              {data.dependents.map((dep, i) => (
                <path
                  key={`dependent-path-${dep.id}`}
                  d={`M ${NODE_X.center + 60} ${centerY} C ${NODE_X.dependents - 60} ${centerY}, ${NODE_X.dependents - 60} ${nodeY(i, data.dependents.length)}, ${NODE_X.dependents - 10} ${nodeY(i, data.dependents.length)}`}
                  fill="none"
                  stroke="var(--color-beige-300)"
                  strokeWidth={2}
                  className="animate-fade-in-up"
                />
              ))}
            </svg>

            {data.dependencies.length > 0 && (
              <div
                className="absolute left-0 top-2 text-[10px] font-medium uppercase tracking-wide text-text-secondary"
                style={{ width: 180 }}
              >
                Depends on
              </div>
            )}
            {data.dependencies.map((dep, i) => (
              <Link
                key={dep.id}
                to={`/projects/${projectId}/jobs/${dep.id}`}
                className="absolute flex -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs shadow-soft transition-transform hover:-translate-y-[calc(50%+2px)]"
                style={{ left: 0, top: nodeY(i, data.dependencies.length), width: 180 }}
              >
                <StatusPill status={dep.status} />
              </Link>
            ))}

            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-cherry-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow"
              style={{ left: NODE_X.center, top: centerY }}
            >
              This job
              <div className="mt-0.5 font-normal opacity-90">{jobStatus.replace(/_/g, " ")}</div>
            </div>

            {data.dependents.length > 0 && (
              <div
                className="absolute top-2 text-[10px] font-medium uppercase tracking-wide text-text-secondary"
                style={{ left: NODE_X.dependents - 20, width: 180 }}
              >
                Depended on by
              </div>
            )}
            {data.dependents.map((dep, i) => (
              <Link
                key={dep.id}
                to={`/projects/${projectId}/jobs/${dep.id}`}
                className="absolute -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs shadow-soft transition-transform hover:-translate-y-[calc(50%+2px)]"
                style={{ left: NODE_X.dependents - 20, top: nodeY(i, data.dependents.length), width: 180 }}
              >
                <StatusPill status={dep.status} />
              </Link>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
