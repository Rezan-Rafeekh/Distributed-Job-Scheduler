import { useTheme } from "../../lib/theme.js";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-beige-100 hover:text-text-primary"
      }
    >
      <span className="text-base leading-none">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}
