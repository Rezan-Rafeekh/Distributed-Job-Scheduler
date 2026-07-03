import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { WsEvent } from "@codity/shared";
import { api, API_URL, getWsToken } from "../lib/apiClient.js";
import { PageHeader } from "../components/PageHeader.js";
import { Card } from "../components/ui/Card.js";

interface Queue {
  id: string;
  name: string;
  isPaused: boolean;
}

interface Worker {
  id: string;
  hostname: string;
  status: string;
  currentJobCount: number;
  concurrency: number;
}

interface Point {
  x: number;
  y: number;
}

interface Traveler {
  id: string;
  from: Point;
  to: Point;
  color: string;
  phase: "start" | "end";
}

const WS_URL = (import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/, "ws")) + "/api/ws";
const TRAVEL_MS = 900;

/** Simple string hash so a job id deterministically (not randomly) picks a
 * worker slot for the animation -- the wire event doesn't carry which worker
 * actually claimed the job, so this is an illustrative assignment, not a
 * literal one. */
function hashToIndex(id: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return mod > 0 ? hash % mod : 0;
}

export function Pipeline() {
  const { projectId } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);

  const { data: queues } = useQuery({
    queryKey: ["queues", projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`),
    refetchInterval: 10000,
  });
  const { data: workers } = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.get<Worker[]>("/workers"),
    refetchInterval: 5000,
  });

  const activeWorkers = (workers ?? []).filter((w) => w.status === "ONLINE");

  const queuePoint = (index: number, count: number): Point => ({
    x: 8,
    y: count <= 1 ? 50 : 12 + (index * 76) / (count - 1),
  });
  const workerPoint = (index: number, count: number): Point => ({
    x: 50,
    y: count <= 1 ? 50 : 12 + (index * 76) / (count - 1),
  });
  const completedPoint: Point = { x: 92, y: 28 };
  const deadLetterPoint: Point = { x: 92, y: 72 };

  useEffect(() => {
    const token = getWsToken();
    if (!token || !projectId || !queues) return;

    const url = new URL(WS_URL);
    url.searchParams.set("token", token);
    url.searchParams.set("projectId", projectId);
    const socket = new WebSocket(url);

    socket.onmessage = (msg) => {
      let event: WsEvent;
      try {
        event = JSON.parse(msg.data as string) as WsEvent;
      } catch {
        return;
      }
      if (event.type !== "job.status_changed") return;

      const queueIndex = queues.findIndex((q) => q.id === event.queueId);
      if (queueIndex === -1) return;
      const from0 = queuePoint(queueIndex, queues.length);
      const workerIdx = activeWorkers.length > 0 ? hashToIndex(event.jobId, activeWorkers.length) : 0;
      const workerPos = activeWorkers.length > 0 ? workerPoint(workerIdx, activeWorkers.length) : { x: 50, y: 50 };

      let from: Point | null = null;
      let to: Point | null = null;
      let color = "var(--color-beige-500)";

      if (event.status === "CLAIMED" || event.status === "RUNNING") {
        from = from0;
        to = workerPos;
        color = "var(--color-warning)";
      } else if (event.status === "COMPLETED") {
        from = workerPos;
        to = completedPoint;
        color = "var(--color-success)";
      } else if (event.status === "DEAD_LETTER") {
        from = workerPos;
        to = deadLetterPoint;
        color = "var(--color-cherry-500)";
      }
      if (!from || !to) return;

      const id = `${event.jobId}-${event.status}-${Date.now()}`;
      setTravelers((prev) => [...prev, { id, from, to: from, color, phase: "start" }]);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTravelers((prev) => prev.map((t) => (t.id === id ? { ...t, to, phase: "end" } : t)));
        });
      });
      setTimeout(() => {
        setTravelers((prev) => prev.filter((t) => t.id !== id));
      }, TRAVEL_MS + 150);
    };

    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, queues, activeWorkers.length]);

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="A live view of jobs flowing from queue → worker → completion or dead letter, driven by the same WebSocket events as the rest of the dashboard."
      />

      <Card className="overflow-hidden">
        <div ref={containerRef} className="relative h-[420px] w-full bg-hero-gradient">
          {/* Column labels */}
          <div className="absolute left-[8%] top-2 -translate-x-1/2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Queues
          </div>
          <div className="absolute left-1/2 top-2 -translate-x-1/2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Workers
          </div>
          <div className="absolute left-[92%] top-2 -translate-x-1/2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Outcome
          </div>

          {/* Queue nodes */}
          {(queues ?? []).map((q, i) => {
            const p = queuePoint(i, queues!.length);
            return (
              <div
                key={q.id}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-primary shadow-soft"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span className={`h-2 w-2 rounded-full ${q.isPaused ? "bg-ink-400" : "bg-beige-500"}`} />
                {q.name}
              </div>
            );
          })}

          {/* Worker nodes */}
          {activeWorkers.map((w, i) => {
            const p = workerPoint(i, activeWorkers.length);
            const load = w.concurrency > 0 ? w.currentJobCount / w.concurrency : 0;
            return (
              <div
                key={w.id}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-warning bg-surface-raised text-[10px] font-semibold text-text-primary shadow-soft"
                  style={{ opacity: 0.55 + load * 0.45 }}
                >
                  {w.currentJobCount}/{w.concurrency}
                </div>
                <span className="font-mono text-[10px] text-text-secondary">{w.hostname.slice(0, 10)}</span>
              </div>
            );
          })}
          {activeWorkers.length === 0 && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-text-secondary">
              No workers online
            </div>
          )}

          {/* Terminal nodes */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-success bg-surface-raised px-3 py-1.5 text-xs font-medium text-success shadow-soft"
            style={{ left: `${completedPoint.x}%`, top: `${completedPoint.y}%` }}
          >
            <span className="h-2 w-2 rounded-full bg-success" /> Completed
          </div>
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-cherry-600 bg-surface-raised px-3 py-1.5 text-xs font-medium text-cherry-700 shadow-soft"
            style={{ left: `${deadLetterPoint.x}%`, top: `${deadLetterPoint.y}%` }}
          >
            <span className="h-2 w-2 rounded-full bg-cherry-600" /> Dead letter
          </div>

          {/* Animated travelers */}
          {travelers.map((t) => (
            <div
              key={t.id}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-glow transition-all ease-out-expo"
              style={{
                left: `${(t.phase === "end" ? t.to : t.from).x}%`,
                top: `${(t.phase === "end" ? t.to : t.from).y}%`,
                backgroundColor: t.color,
                transitionDuration: `${TRAVEL_MS}ms`,
              }}
            />
          ))}
        </div>
      </Card>

      <p className="mt-3 text-xs text-text-secondary">
        Worker assignment shown here is illustrative — the live-update event doesn't carry which specific worker
        claimed a job, so each traveling dot lands on a deterministically-chosen worker node rather than the
        literal one.
      </p>
    </div>
  );
}
