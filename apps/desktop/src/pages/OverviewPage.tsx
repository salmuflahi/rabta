import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionBridge,
  DotText,
  LensPanel,
  OrbitThreads,
  QuietDock,
} from "@/vendor/rabta-ui/lens";
import { Icon } from "@/components/ui/icon";
import { ContextMeasure } from "@/components/ContextMeasure";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import {
  capsuleBranch,
  capsuleChips,
  capsuleSavedAt,
} from "@/lib/capsuleFacts";
import { describeEvent, relativeTime } from "@/lib/humanize";
import { useOwnsViewAccent } from "@/shell/viewAccent";
import { useStore, type Project, type Task, type TaskResource } from "@/store";

/** A capsule with everything Overview needs to talk about it, resolved once
 * so the hero and the "Also open" list can't disagree about a branch or a
 * saved time. */
interface CapsuleFacts {
  task: Task;
  projectName: string;
  branch: string | null;
  savedAt: string | null;
  resources: TaskResource[];
}

/** The handoff's date heading — "Saturday, 9 August". Locale-formatted
 * rather than hand-assembled so it reads correctly outside en-GB; the
 * handoff's example is the shape, not the string.
 *
 * This desktop screen has no connected identity yet; use the date until
 * a real Rabta account session is available. Do not invent a profile. */
function formatToday(now: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

/** "2 apps connected · 4 capsules open · last capture 12m ago" — the whole
 * state of this Mac in one line. Clauses that have nothing true to say are
 * dropped rather than padded with zeroes: a Mac with no capture yet says so
 * by not mentioning capture. */
function glanceLine(
  connected: number,
  open: number,
  lastCapture: string | null,
): string {
  const parts = [
    `${connected} ${connected === 1 ? "app" : "apps"} connected`,
    `${open} ${open === 1 ? "capsule" : "capsules"} open`,
  ];
  if (lastCapture) parts.push(`last capture ${lastCapture}`);
  return parts.join(" · ");
}

/** Section heading above each grouped list — 12/600, secondary. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="lens-group-title">{children}</h2>;
}

/** The grouped-surface list container the handoff uses for "Also open" and
 * "Recent": 10px radius, hairline ring, rows divided by 0.5px hairlines and
 * clipped by the container's own radius. */
function GroupedList({ children }: { children: React.ReactNode }) {
  return (
    <div className="lens-group-list mt-[7px] overflow-hidden bg-card shadow-raised">
      <div className="divide-y-[0.5px] divide-border">{children}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="lens-overview h-full min-h-0 overflow-y-auto">
      <span className="sr-only" role="status">Loading your workspace</span>
      <div className="lens-overview-inner">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mb-8 mt-3 h-4 w-full max-w-80" />
      <div className="lens-overview-grid">
      <div className="min-h-[440px] rounded-[26px] bg-card p-7 shadow-raised">
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-[38px] shrink-0 rounded-[9px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-[7px]" />
        </div>
      </div>
      <Skeleton className="min-h-[380px] w-full rounded-[26px]" />
      </div>
      {[0, 1].map((i) => (
        <div key={i}>
          <Skeleton className="mt-[26px] h-3 w-24" />
          <div className="mt-[7px] space-y-px rounded-[10px] bg-card p-4 shadow-raised">
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

/**
 * Overview — "what is the state of this Mac", at a glance.
 *
 * Deliberately short, and deliberately not a dashboard: the handoff is
 * explicit that it carries "no counts that repeat the sidebar badges". The
 * page is a date, one line of state, the capsule you were last in, the
 * others that are open, and what just happened. Everything else belongs on
 * the screen that owns it.
 */
export function OverviewPage() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const connectors = useStore((s) => s.connectors);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const log = useStore((s) => s.log);
  const setView = useStore((s) => s.setView);
  const requestResume = useStore((s) => s.requestResume);
  const selectCapsule = useStore((s) => s.selectCapsule);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Record<string, TaskResource[]>>(
    {},
  );
  // Pre-first-load window only: true until the initial list_projects fetch
  // settles, then stays false.
  const [loading, setLoading] = useState(true);
  // A failed load is distinct from an empty workspace — see LoadError.
  const [loadError, setLoadError] = useState(false);
  const [contextState, setContextState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const projectRequest = useRef(0);

  const loadProjects = useCallback(() => {
    const request = ++projectRequest.current;
    setLoading(true);
    setLoadError(false);
    setContextState("loading");
    invoke<Project[]>("list_projects")
      .then((p) => {
        if (request !== projectRequest.current) return;
        setProjects([...p]);
        setLoadError(false);
      })
      .catch((e) => {
        if (request !== projectRequest.current) return;
        console.error("list_projects failed:", e);
        setLoadError(true);
      })
      .finally(() => {
        if (request === projectRequest.current) setLoading(false);
      });
  }, [setProjects]);

  useEffect(() => {
    loadProjects();
    return () => {
      projectRequest.current += 1;
    };
  }, [loadProjects]);

  useEffect(() => {
    invoke<string | null>("active_task")
      .then(setActiveTaskId)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tasks and their captured resources, for every registered project. The
  // resources are what make the hero honest — its branch, saved time and
  // tool chips are all read off real payloads, never assumed. Guarded so a
  // slow earlier fetch can't overwrite a newer one after `projects` changes.
  useEffect(() => {
    if (projects.length === 0) {
      setTasks([]);
      setResources({});
      setContextState("ready");
      return;
    }
    let cancelled = false;
    setContextState("loading");
    Promise.all(
      projects.map((p) => invoke<Task[]>("list_tasks", { projectId: p.id })),
    )
      .then(async (lists) => {
        const all = lists.flat();
        if (cancelled) return;
        const pairs = await Promise.all(
          all.map(
            async (t) =>
              [
                t.id,
                await invoke<TaskResource[]>("task_resources", {
                  taskId: t.id,
                }),
              ] as const,
          ),
        );
        if (!cancelled) {
          setTasks(all);
          setResources(Object.fromEntries(pairs));
          setContextState("ready");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("loading capsules failed:", e);
        setContextState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const projectName = useCallback(
    (id: string) =>
      projects.find((p) => p.id === id)?.name ?? "Unknown project",
    [projects],
  );

  // Open capsules, most recently captured first. The hero is the one you
  // were last in — the active task if there is one, otherwise the freshest
  // capture — and "Also open" is the rest.
  const openCapsules = useMemo<CapsuleFacts[]>(() => {
    const facts = tasks
      .filter((t) => t.status === "open")
      .map((task) => {
        const rs = resources[task.id] ?? [];
        return {
          task,
          projectName: projectName(task.projectId),
          branch: capsuleBranch(rs),
          savedAt: capsuleSavedAt(rs),
          resources: rs,
        };
      });
    return facts.sort((a, b) => {
      if (a.task.id === activeTaskId) return -1;
      if (b.task.id === activeTaskId) return 1;
      return (
        (Date.parse(b.savedAt ?? "") || 0) - (Date.parse(a.savedAt ?? "") || 0)
      );
    });
  }, [tasks, resources, projectName, activeTaskId]);

  const hero = openCapsules[0];
  // The hero's "Resume" is this screen's real primary action, so the Toolbar's
  // "New capsule" stands down to neutral while it's on screen (Toolbar.tsx).
  // The empty state below has no action of its own and makes no claim — there,
  // starting a capsule is the primary action, and the Toolbar keeps the accent.
  // `!loading` holds the same line the other two pages do — no page claims
  // from data it hasn't loaded. Redundant here today, since `hero` is
  // undefined until the fetch lands anyway, but stated rather than relied on:
  // the rule is uniform across the three claiming pages, and a future default
  // or optimistic hero would otherwise blank the screen's accent mid-load.
  useOwnsViewAccent(!loading && contextState === "ready" && Boolean(hero));
  const alsoOpen = openCapsules.slice(1, 4);
  const connectedCount = connectors.filter((c) => c.connected).length;
  const lastCapture = useMemo(() => {
    const stamps = openCapsules
      .map((c) => c.savedAt)
      .filter((s): s is string => Boolean(s));
    return stamps.length ? relativeTime(stamps[0]) : null;
  }, [openCapsules]);
  const recent = [...log].slice(-5).reverse();
  const resolveName = (id: string) => connectors.find((c) => c.id === id)?.name;

  function openInCapsules(taskId: string) {
    selectCapsule(taskId);
    setView("capsules");
  }

  function resume(taskId: string) {
    requestResume(taskId);
    setView("capsules");
  }

  if (loadError || contextState === "error")
    return <LoadError onRetry={loadProjects} />;
  if (loading || contextState === "loading") return <OverviewSkeleton />;

  return (
    // The shell's pane no longer scrolls (AppShell.tsx) — each screen owns
    // its own scroller. Overview's is one 660px reading column, centred:
    // the handoff's Overview is not a dashboard grid, everything on it is
    // one thing wide.
    <div className="lens-overview h-full min-h-0 overflow-y-auto">
      <div className="lens-overview-inner">
        <header className="lens-overview-heading">
          <div>
            <h1 className="text-display font-640 text-foreground">
              {formatToday(new Date())}
            </h1>
            <p className="mt-[7px] text-sub text-muted-foreground">
              {glanceLine(connectedCount, openCapsules.length, lastCapture)}
            </p>
          </div>
          <QuietDock
            label="Quick navigation"
            items={[
              { id: "capsules", label: "Capsules", icon: "capsule" },
              { id: "connectors", label: "Connections", icon: "link" },
              { id: "activity", label: "Activity", icon: "timeline" },
            ]}
            onAction={(id) =>
              setView(id as "capsules" | "connectors" | "activity")
            }
          />
        </header>

        <div className="lens-overview-grid">
          {hero ? (
            <section
              aria-label="Pick up where you left off"
              className="lens-resume-section"
            >
              <LensPanel className="lens-resume-card">
                <div className="lens-panel-eyebrow">
                  <span>
                    {hero.task.id === activeTaskId && (
                      <i
                        data-accent-mark
                        aria-hidden="true"
                        className="mr-2 inline-block size-1.5 rounded-full bg-primary"
                      />
                    )}
                    Pick up where you left off
                  </span>
                  <Icon name="capsule" className="size-4" />
                </div>
                <h2 className="lens-task-title">{hero.task.title}</h2>
                <p className="lens-task-meta">
                  {hero.projectName}
                  {hero.branch && (
                    <>
                      {" · "}
                      <span className="font-mono text-meta">{hero.branch}</span>
                    </>
                  )}
                  {" · "}
                  {hero.savedAt
                    ? `saved ${relativeTime(hero.savedAt)}`
                    : "never captured"}
                </p>
                <div className="lens-resume-context">
                  <ContextMeasure
                    items={capsuleChips(hero.resources).map((chip) => ({
                      id: chip.key,
                      label: chip.label,
                      count: chip.count,
                    }))}
                  />
                </div>
                <ActionBridge
                  onClick={() => resume(hero.task.id)}
                  left={<Icon name="capsule" className="size-5" />}
                  right={<Icon name="play" className="size-4" />}
                >
                  Resume
                </ActionBridge>
              </LensPanel>
            </section>
          ) : (
            <section
              aria-label="Pick up where you left off"
              className="lens-empty-capsule"
            >
              <LensPanel>
                <OrbitThreads label="Your workspace, gathered around a task" />
                <Icon
                  name="capsule"
                  className="mx-auto size-5 text-tertiary-foreground"
                />
                <p className="mt-2 text-card-title font-590 text-foreground">
                  Nothing open yet
                </p>
                <p className="mt-1 text-meta text-muted-foreground">
                  Start a capsule and Rabta keeps your files, tabs and branch
                  together.
                </p>
              </LensPanel>
            </section>
          )}

          <LensPanel tone="sage" className="lens-connections-card">
            <div className="lens-panel-eyebrow">
              <span>This Mac</span>
              <Icon name="shield" className="size-4" />
            </div>
            <DotText text="IN REACH" className="lens-in-reach" />
            <p className="lens-connections-intro">
              The tools around your work.
            </p>
            <ul className="lens-tool-list">
              {connectors.slice(0, 4).map((connector) => (
                <li key={connector.id}>
                  <span>{connector.name}</span>
                  <small data-connected={connector.connected}>
                    {connector.connected ? "Connected" : "Disconnected"}
                  </small>
                </li>
              ))}
            </ul>
            {connectors.length === 0 && (
              <p className="lens-connection-empty">
                Connect your editor or browser to bring its context into Rabta.
              </p>
            )}
            <button
              type="button"
              className="lens-text-action"
              onClick={() => setView("connectors")}
            >
              Manage connections{" "}
              <Icon name="chevron-right" className="size-4" />
            </button>
            <span className="lens-local-note">
              Everything stays on this Mac.
            </span>
          </LensPanel>
        </div>

        <div className="lens-overview-lists">
          {alsoOpen.length > 0 && (
            <>
              <GroupHeading>Also open</GroupHeading>
              <GroupedList>
                {alsoOpen.map((c, i) => (
                  <button
                    key={c.task.id}
                    type="button"
                    onClick={() => openInCapsules(c.task.id)}
                    style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                    className="animate-page-in flex w-full cursor-default items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-foreground">
                      {c.task.title}
                    </span>
                    {c.branch && (
                      <span className="shrink-0 font-mono text-[11px] text-tertiary-foreground">
                        {c.branch}
                      </span>
                    )}
                    <span className="w-[78px] shrink-0 text-right text-meta text-tertiary-foreground">
                      {c.savedAt ? relativeTime(c.savedAt) : "—"}
                    </span>
                  </button>
                ))}
              </GroupedList>
            </>
          )}

          {recent.length > 0 && (
            <>
              <GroupHeading>Recent</GroupHeading>
              <GroupedList>
                {recent.map((e, i) => (
                  <div
                    key={e.seq}
                    style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                    className="animate-page-in flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-foreground">
                      {describeEvent(e, resolveName).sentence}
                    </span>
                    <span className="shrink-0 text-meta text-tertiary-foreground">
                      {relativeTime(e.at)}
                    </span>
                  </div>
                ))}
              </GroupedList>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
