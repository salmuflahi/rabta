import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Icon } from "@/components/ui/icon";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { capsuleBranch, capsuleChips, capsuleSavedAt } from "@/lib/capsuleFacts";
import { describeEvent, relativeTime } from "@/lib/humanize";
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
 * The app has no account and must never greet the user by name. The date is
 * deliberately the most personal thing on this screen. */
function formatToday(now: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(
    now,
  );
}

/** "2 apps connected · 4 capsules open · last capture 12m ago" — the whole
 * state of this Mac in one line. Clauses that have nothing true to say are
 * dropped rather than padded with zeroes: a Mac with no capture yet says so
 * by not mentioning capture. */
function glanceLine(connected: number, open: number, lastCapture: string | null): string {
  const parts = [
    `${connected} ${connected === 1 ? "app" : "apps"} connected`,
    `${open} ${open === 1 ? "capsule" : "capsules"} open`,
  ];
  if (lastCapture) parts.push(`last capture ${lastCapture}`);
  return parts.join(" · ");
}

/** Section heading above each grouped list — 12/600, secondary. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return <p className="mt-[26px] pl-0.5 text-sub font-semibold text-muted-foreground">{children}</p>;
}

/** The grouped-surface list container the handoff uses for "Also open" and
 * "Recent": 10px radius, hairline ring, rows divided by 0.5px hairlines and
 * clipped by the container's own radius. */
function GroupedList({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[7px] overflow-hidden rounded-[10px] bg-card shadow-raised">
      <div className="divide-y-[0.5px] divide-border">{children}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto h-full max-w-[660px] overflow-y-auto px-8 pb-11 pt-10">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-4 w-80" />
      <div className="mt-[26px] rounded-[10px] bg-card p-[18px] shadow-raised">
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-[38px] shrink-0 rounded-[9px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-[7px]" />
        </div>
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
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  // Pre-first-load window only: true until the initial list_projects fetch
  // settles, then stays false.
  const [loading, setLoading] = useState(true);
  // A failed load is distinct from an empty workspace — see LoadError.
  const [loadError, setLoadError] = useState(false);

  const loadProjects = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    invoke<Project[]>("list_projects")
      .then((p) => {
        setProjects(p);
        setLoadError(false);
      })
      .catch((e) => {
        console.error("list_projects failed:", e);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [setProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
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
      return;
    }
    let cancelled = false;
    Promise.all(projects.map((p) => invoke<Task[]>("list_tasks", { projectId: p.id })))
      .then(async (lists) => {
        const all = lists.flat();
        if (cancelled) return;
        setTasks(all);
        const pairs = await Promise.all(
          all.map(
            async (t) =>
              [t.id, await invoke<TaskResource[]>("task_resources", { taskId: t.id })] as const,
          ),
        );
        if (!cancelled) setResources(Object.fromEntries(pairs));
      })
      .catch((e) => console.error("loading capsules failed:", e));
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? "Unknown project",
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
      return (Date.parse(b.savedAt ?? "") || 0) - (Date.parse(a.savedAt ?? "") || 0);
    });
  }, [tasks, resources, projectName, activeTaskId]);

  const hero = openCapsules[0];
  const alsoOpen = openCapsules.slice(1, 4);
  const connectedCount = connectors.filter((c) => c.connected).length;
  const lastCapture = useMemo(() => {
    const stamps = openCapsules.map((c) => c.savedAt).filter((s): s is string => Boolean(s));
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

  if (loading) return <OverviewSkeleton />;
  if (loadError) return <LoadError onRetry={loadProjects} />;

  return (
    // The shell's pane no longer scrolls (AppShell.tsx) — each screen owns
    // its own scroller. Overview's is one 660px reading column, centred:
    // the handoff's Overview is not a dashboard grid, everything on it is
    // one thing wide.
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[660px] px-8 pb-11 pt-10">
      <h1 className="text-display font-640 text-foreground">{formatToday(new Date())}</h1>
      <p className="mt-[7px] text-sub text-muted-foreground">
        {glanceLine(connectedCount, openCapsules.length, lastCapture)}
      </p>

      {hero ? (
        <section
          aria-label="Pick up where you left off"
          className="mt-[26px] rounded-[10px] bg-card p-[18px] shadow-raised"
        >
          <div className="flex items-start gap-3.5">
            <img src={markUrl} alt="" width={38} height={38} className="shrink-0 rounded-[9px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* The "this is the live one" mark. Legitimately the accent
                    colour, but it is not an action, so it opts out of the
                    one-accent budget the Resume button spends. */}
                <span
                  data-accent-mark
                  aria-hidden
                  className="size-[7px] shrink-0 rounded-full bg-primary"
                />
                <p className="truncate text-card-title font-590 text-foreground">{hero.task.title}</p>
              </div>
              <p className="mt-1 text-meta text-muted-foreground">
                {hero.projectName}
                {hero.branch && (
                  <>
                    {" · "}
                    <span className="font-mono text-meta">{hero.branch}</span>
                  </>
                )}
                {" · "}
                {hero.savedAt ? `saved ${relativeTime(hero.savedAt)}` : "never captured"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => resume(hero.task.id)}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-primary px-3.5 text-body font-510 text-primary-foreground transition-colors duration-fast ease-standard hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <Icon name="play" className="size-[11px]" />
              Resume
            </button>
          </div>
          {/* Indented 52px to clear the 38px mark plus its gap, so the chips
              line up under the title rather than under the icon. */}
          <div className="mt-3.5 flex flex-wrap gap-1.5 pl-[52px]">
            {capsuleChips(hero.resources).map((chip) => (
              <span
                key={chip.key}
                data-capsule-chip={chip.key}
                className="inline-flex items-center gap-1.5 rounded-[7px] bg-secondary px-[9px] py-[5px] text-meta text-muted-foreground"
              >
                <Icon name={chip.icon} className="size-3 shrink-0" />
                {chip.label}
              </span>
            ))}
          </div>
        </section>
      ) : (
        <section
          aria-label="Pick up where you left off"
          className="mt-[26px] rounded-[10px] border border-dashed border-border bg-card/40 px-[18px] py-7 text-center"
        >
          <Icon name="capsule" className="mx-auto size-5 text-tertiary-foreground" />
          <p className="mt-2 text-card-title font-590 text-foreground">Nothing open yet</p>
          <p className="mt-1 text-meta text-muted-foreground">
            Start a capsule and Rabta keeps your files, tabs and branch together.
          </p>
        </section>
      )}

      {alsoOpen.length > 0 && (
        <>
          <GroupHeading>Also open</GroupHeading>
          <GroupedList>
            {alsoOpen.map((c) => (
              <button
                key={c.task.id}
                type="button"
                onClick={() => openInCapsules(c.task.id)}
                className="flex w-full cursor-default items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate text-body text-foreground">{c.task.title}</span>
                {c.branch && (
                  <span className="shrink-0 font-mono text-[11px] text-tertiary-foreground">{c.branch}</span>
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
            {recent.map((e) => (
              <div key={e.seq} className="flex items-center gap-3 px-4 py-2.5">
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
  );
}
