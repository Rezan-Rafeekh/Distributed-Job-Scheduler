import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "../lib/auth.js";
import { useLiveUpdates } from "../lib/useLiveUpdates.js";
import { CommandPalette } from "./CommandPalette.js";
import { ThemeToggle } from "./ui/ThemeToggle.js";

const NAV_ITEMS = [
  { to: "", label: "Overview", icon: "◆", end: true },
  { to: "queues", label: "Queues", icon: "☷" },
  { to: "jobs", label: "Job Explorer", icon: "≡" },
  { to: "pipeline", label: "Pipeline", icon: "⟿" },
  { to: "scheduled", label: "Scheduled", icon: "⏱" },
  { to: "workers", label: "Workers", icon: "⚙" },
  { to: "dlq", label: "Dead Letters", icon: "☠" },
  { to: "metrics", label: "Metrics", icon: "▤" },
];

export function ProjectLayout() {
  const { projectId } = useParams();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useLiveUpdates(projectId);

  // Close the mobile drawer whenever the route changes, so a nav click doesn't
  // leave the overlay open on top of the newly-loaded page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <>
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cherry-gradient text-white font-bold shadow-glow">
          C
        </div>
        <span className="font-display text-lg font-medium tracking-tight text-text-primary">Codity</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={`/projects/${projectId}/${item.to}`}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out-expo",
                isActive
                  ? "bg-cherry-50 text-cherry-700"
                  : "text-text-secondary hover:translate-x-0.5 hover:bg-beige-100 hover:text-text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    "absolute left-0 h-4 w-0.5 rounded-full bg-cherry-600 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="text-base leading-none opacity-80">{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="flex flex-1 items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-beige-100"
        >
          <span>Quick jump</span>
          <span className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono">⌘K</span>
        </button>
        <ThemeToggle />
      </div>

      <div className="border-t border-border pt-4">
        <div className="px-2 text-xs text-text-secondary truncate">{user?.email}</div>
        <button
          onClick={logout}
          className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary hover:bg-beige-100 hover:text-cherry-700"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <CommandPalette />

      {/* Static sidebar from lg breakpoint up */}
      <aside className="hidden w-60 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">{sidebar}</aside>

      {/* Mobile drawer: backdrop + slide-in panel, only rendered interactive below lg */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-ink-900/40 transition-opacity lg:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface px-4 py-6 transition-transform lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with hamburger toggle */}
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-primary hover:bg-beige-100"
          >
            ☰
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cherry-gradient text-sm font-bold text-white">
            C
          </div>
          <span className="flex-1 font-display font-medium tracking-tight text-text-primary">Codity</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-6xl animate-fade-in-up px-4 py-6 sm:px-8 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
