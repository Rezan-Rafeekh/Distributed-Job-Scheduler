export const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  SCHEDULED: { bg: "bg-beige-200", text: "text-text-secondary", dot: "bg-ink-400" },
  QUEUED: { bg: "bg-beige-200", text: "text-text-secondary", dot: "bg-ink-400" },
  CLAIMED: { bg: "bg-warning-soft", text: "text-warning-soft-text", dot: "bg-warning" },
  RUNNING: { bg: "bg-warning-soft", text: "text-warning-soft-text", dot: "bg-warning" },
  COMPLETED: { bg: "bg-success-soft", text: "text-success-soft-text", dot: "bg-success" },
  DEAD_LETTER: { bg: "bg-cherry-100", text: "text-cherry-800", dot: "bg-cherry-700" },
  CANCELLED: { bg: "bg-ink-100", text: "text-ink-600", dot: "bg-ink-400" },
  ONLINE: { bg: "bg-success-soft", text: "text-success-soft-text", dot: "bg-success" },
  DRAINING: { bg: "bg-warning-soft", text: "text-warning-soft-text", dot: "bg-warning" },
  OFFLINE: { bg: "bg-ink-100", text: "text-ink-600", dot: "bg-ink-400" },
  PENDING: { bg: "bg-cherry-100", text: "text-cherry-800", dot: "bg-cherry-700" },
  REQUEUED: { bg: "bg-success-soft", text: "text-success-soft-text", dot: "bg-success" },
  DISCARDED: { bg: "bg-ink-100", text: "text-ink-600", dot: "bg-ink-400" },
};

export function statusColor(status: string) {
  return statusColors[status] ?? statusColors.QUEUED!;
}
