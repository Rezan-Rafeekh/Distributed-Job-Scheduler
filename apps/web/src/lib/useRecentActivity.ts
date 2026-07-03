import { useEffect, useRef, useState } from "react";
import type { WsEvent } from "@codity/shared";
import { API_URL, getWsToken } from "./apiClient.js";

const WS_URL = (import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/, "ws")) + "/api/ws";

export interface ActivityEntry {
  id: string;
  text: string;
  timestamp: string;
}

/** A rolling feed of recent live events for the Overview page's activity panel. */
export function useRecentActivity(projectId: string | undefined, max = 12): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const token = getWsToken();
    if (!token || !projectId) return;

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

      let text: string | null = null;
      if (event.type === "job.status_changed") {
        text = `Job ${event.jobId.slice(0, 8)} → ${event.status.replace(/_/g, " ")}`;
      } else if (event.type === "worker.status_changed") {
        text = `Worker ${event.workerId.slice(0, 8)} → ${event.status}`;
      }
      if (!text) return;

      const entry: ActivityEntry = { id: `${Date.now()}-${counter.current++}`, text, timestamp: event.timestamp };
      setEntries((prev) => [entry, ...prev].slice(0, max));
    };

    return () => socket.close();
  }, [projectId, max]);

  return entries;
}
