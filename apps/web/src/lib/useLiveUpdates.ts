import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsEvent } from "@codity/shared";
import { API_URL, getWsToken } from "./apiClient.js";

const WS_URL = (import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/, "ws")) + "/api/ws";

/**
 * Enhances (never replaces) TanStack Query's polling with near-instant cache
 * updates over WebSocket. If the socket drops, polling alone keeps the
 * dashboard correct — this hook is a latency optimization, not a dependency.
 */
export function useLiveUpdates(projectId: string | undefined): void {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getWsToken();
    if (!token) return;

    const url = new URL(WS_URL);
    url.searchParams.set("token", token);
    if (projectId) url.searchParams.set("projectId", projectId);

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = (msg) => {
      let event: WsEvent;
      try {
        event = JSON.parse(msg.data as string) as WsEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "job.status_changed":
          void queryClient.invalidateQueries({ queryKey: ["jobs"] });
          void queryClient.invalidateQueries({ queryKey: ["job", event.jobId] });
          void queryClient.invalidateQueries({ queryKey: ["queue-stats", event.queueId] });
          break;
        case "queue.stats_changed":
          void queryClient.invalidateQueries({ queryKey: ["queue-stats", event.queueId] });
          void queryClient.invalidateQueries({ queryKey: ["queues"] });
          break;
        case "worker.heartbeat":
        case "worker.status_changed":
          void queryClient.invalidateQueries({ queryKey: ["workers"] });
          break;
      }
    };

    return () => socket.close();
  }, [projectId, queryClient]);
}
