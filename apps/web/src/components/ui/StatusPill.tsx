import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { statusColor } from "../../lib/statusColors.js";

/** Briefly flashes the pill when `status` changes from its previous value, so a
 * live update (WebSocket-driven) is visibly noticed instead of silently
 * eventually-consistent on the next render. */
export function StatusPill({ status }: { status: string }) {
  const c = statusColor(status);
  const previous = useRef(status);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (previous.current !== status) {
      previous.current = status;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <span
      data-flash={flash}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        c.bg,
        c.text,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
