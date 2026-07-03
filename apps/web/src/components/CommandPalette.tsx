import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "../lib/apiClient.js";

interface Queue {
  id: string;
  name: string;
}

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  onSelect: () => void;
}

export function CommandPalette() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: queues } = useQuery({
    queryKey: ["queues", projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`),
    enabled: open && !!projectId,
    staleTime: 30000,
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = projectId
      ? [
          { id: "nav-overview", label: "Go to Overview", icon: "◆", onSelect: () => go(`/projects/${projectId}`) },
          { id: "nav-queues", label: "Go to Queues", icon: "☷", onSelect: () => go(`/projects/${projectId}/queues`) },
          { id: "nav-jobs", label: "Go to Job Explorer", icon: "≡", onSelect: () => go(`/projects/${projectId}/jobs`) },
          { id: "nav-workers", label: "Go to Workers", icon: "⚙", onSelect: () => go(`/projects/${projectId}/workers`) },
          { id: "nav-dlq", label: "Go to Dead Letters", icon: "☠", onSelect: () => go(`/projects/${projectId}/dlq`) },
          { id: "nav-scheduled", label: "Go to Scheduled", icon: "⏱", onSelect: () => go(`/projects/${projectId}/scheduled`) },
          { id: "nav-metrics", label: "Go to Metrics", icon: "▤", onSelect: () => go(`/projects/${projectId}/metrics`) },
          { id: "nav-pipeline", label: "Go to Pipeline", icon: "⟿", onSelect: () => go(`/projects/${projectId}/pipeline`) },
        ]
      : [];

    const queueActions: PaletteAction[] = (queues ?? []).map((q) => ({
      id: `queue-${q.id}`,
      label: q.name,
      hint: "Queue",
      icon: "☷",
      onSelect: () => go(`/projects/${projectId}/queues/${q.id}`),
    }));

    return [...base, ...queueActions];
  }, [projectId, queues]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-ink-900/40 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg animate-fade-in-up overflow-hidden rounded-xl border border-border bg-surface-raised shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              filtered[activeIndex]?.onSelect();
            }
          }}
          placeholder="Jump to a queue or page…"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">No matches.</p>
          )}
          {filtered.map((action, i) => (
            <button
              key={action.id}
              onClick={action.onSelect}
              onMouseEnter={() => setActiveIndex(i)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                i === activeIndex ? "bg-cherry-50 text-cherry-700" : "text-text-primary hover:bg-beige-100",
              )}
            >
              <span className="text-base opacity-70">{action.icon}</span>
              <span className="flex-1">{action.label}</span>
              {action.hint && <span className="text-xs text-text-secondary">{action.hint}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-secondary">
          <span>↑↓ navigate · ↵ select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
