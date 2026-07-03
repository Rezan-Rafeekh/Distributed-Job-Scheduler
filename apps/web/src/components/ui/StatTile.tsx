import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

/** requestAnimationFrame count-up from the previous value to the next — no dependency. */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

export function StatTile({
  label,
  value,
  accent = "default",
  className,
}: {
  label: string;
  value: number;
  accent?: "default" | "cherry" | "success";
  className?: string;
}) {
  const animated = useCountUp(value);

  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-surface-raised p-4 shadow-soft transition-shadow hover:shadow-raised",
        className,
      )}
    >
      <div
        className={clsx(
          "font-display text-3xl font-medium tabular-nums",
          accent === "cherry" && "text-cherry-600",
          accent === "success" && "text-success",
          accent === "default" && "text-text-primary",
        )}
      >
        {animated.toLocaleString()}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</div>
    </div>
  );
}
