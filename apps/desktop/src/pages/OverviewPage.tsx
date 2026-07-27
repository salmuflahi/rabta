import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Circle,
  Code2,
  FolderGit2,
  Globe,
  ListChecks,
  Play,
  Plug,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shell/PageHeader";
import { kindLabel } from "@/lib/connectors";
import { describeEvent, formatDuration, relativeTime } from "@/lib/humanize";
import { ProjectIcon } from "@/lib/project-icons";
import { cn } from "@/lib/utils";
import { useStore, type Project, type Task } from "@/store";

/** A consistent section heading used across the command center. */
function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-body font-semibold text-foreground">{children}</p>
      {action}
    </div>
  );
}

function SectionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm text-label text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

function NextStepCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="card-lift flex flex-col p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <CardHeader className="p-0 pt-3">
        <CardTitle className="text-card">{title}</CardTitle>
        <CardDescription className="text-meta">{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto p-0 pt-3">
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Real-progress onboarding checklist. Each step is derived from actual store
 * data (a registered project, a connector ever seen, a created task), and the
 * whole card auto-hides once setup is complete — it never nags a set-up user.
 * Only the next incomplete step surfaces an action, to keep the path obvious. */
function GettingStarted({
  hasConnector,
  hasTask,
  onConnect,
  onNewCapsule,
}: {
  hasConnector: boolean;
  hasTask: boolean;
  onConnect: () => void;
  onNewCapsule: () => void;
}) {
  const steps: {
    done: boolean;
    label: string;
    description: string;
    action?: { label: string; onClick: () => void };
  }[] = [
    { done: true, label: "Register a project", description: "Rabta is tracking a repository." },
    {
      done: hasConnector,
      label: "Connect an editor or browser",
      description: "Install the VS Code (or Cursor) or Chrome extension so Rabta can capture your workspace.",
      action: { label: "Connect a tool", onClick: onConnect },
    },
    {
      done: hasTask,
      label: "Capture your first capsule",
      description: "Create a task, open your files and tabs, then Save State to snapshot the workspace.",
      action: { label: "New capsule", onClick: onNewCapsule },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-card font-semibold text-foreground">Get started with Rabta</p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {doneCount} of {steps.length} done — you're moments from your first capture.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-8 rounded-full transition-colors duration-standard ease-standard",
                s.done ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
      <ol className="flex flex-col gap-0.5">
        {steps.map((step, i) => {
          const isNext = !step.done && steps.slice(0, i).every((s) => s.done);
          return (
            <li key={i} className="flex items-center gap-3 rounded-lg px-1 py-2">
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-primary" />
              ) : (
                <Circle
                  className={cn("size-5 shrink-0", isNext ? "text-primary" : "text-muted-foreground/40")}
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-body font-medium",
                    step.done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-meta leading-relaxed text-muted-foreground">{step.description}</p>
                )}
              </div>
              {isNext && step.action && (
                <Button size="sm" onClick={step.action.onClick} className="shrink-0">
                  {step.action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Command-center stat tile. The numeral is the hero (large, tabular so the
 * three tiles line up); the label recedes to an uppercase micro-eyebrow. One
 * tile can lead with the tangerine accent (`accent`) so the eye lands on what
 * matters (an active workspace) rather than treating all counts equally. */
function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      {/* Hairline top sheen — gives the tile a lit, physical surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[30px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="mt-1.5 truncate text-label font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Skeleton placeholder for the pre-first-load window only — approximates
 * the stat-card row plus the recent-activity card, matching real sizes so
 * there's no layout shift once list_projects resolves. */
function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full max-w-xs" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function OverviewPage() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const connectors = useStore((s) => s.connectors);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const log = useStore((s) => s.log);
  const setView = useStore((s) => s.setView);
  const requestResume = useStore((s) => s.requestResume);
  const requestNewTask = useStore((s) => s.requestNewTask);

  const [tasks, setTasks] = useState<Task[]>([]);
  // Pre-first-load window only: true until the initial list_projects fetch
  // settles (the fetch that decides welcome-vs-dashboard), then stays false.
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

  // Aggregate open-task count from the same list_tasks invoke CapsulesPage
  // already uses — no new backend, just reused across pages. Guarded so a
  // slow earlier fetch can't overwrite a newer one after `projects` changes.
  useEffect(() => {
    if (projects.length === 0) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    Promise.all(projects.map((p) => invoke<Task[]>("list_tasks", { projectId: p.id })))
      .then((lists) => {
        if (!cancelled) setTasks(lists.flat());
      })
      .catch((e) => console.error("list_tasks failed:", e));
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const connectedCount = connectors.filter((c) => c.connected).length;
  const openCount = tasks.filter((t) => t.status === "open").length;
  const resolveName = (id: string) => connectors.find((c) => c.id === id)?.name;
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const recentLog = [...log].slice(-5).reverse();
  const continueProjects = projects
    .filter(
      (project) =>
        project.lastOpenedAt !== null && Number.isFinite(Date.parse(project.lastOpenedAt)),
    )
    .sort((a, b) => Date.parse(b.lastOpenedAt!) - Date.parse(a.lastOpenedAt!))
    .slice(0, 5);

  function resumeTask(taskId: string) {
    requestResume(taskId);
    setView("capsules");
  }

  return (
    <div>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Overview"
        subtitle={
          projects.length === 0
            ? "Nothing registered yet"
            : "A snapshot of your projects, connectors, and recent activity"
        }
      />

      {loading ? (
        <OverviewSkeleton />
      ) : loadError ? (
        <LoadError onRetry={loadProjects} />
      ) : projects.length === 0 ? (
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col items-center gap-3 border-dashed p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </div>
            <div className="max-w-xl space-y-1.5">
              <p className="text-title font-semibold text-foreground">Welcome to Rabta</p>
              <p className="text-body leading-relaxed text-muted-foreground">
                One command center for your projects, editors, and browser tabs — switch tasks
                and Rabta restores the right branch, files, and tabs for you.
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <NextStepCard
              icon={FolderGit2}
              title="Register a Project"
              description="Point Rabta at a git repository to start tracking tasks and branches."
              actionLabel="Register Project"
              onAction={() => setView("projects")}
            />
            <NextStepCard
              icon={Code2}
              title="Connect an Editor"
              description="Install the VS Code (or Cursor) extension so Rabta can open workspaces and files."
              actionLabel="Go to Connectors"
              onAction={() => setView("connectors")}
            />
            <NextStepCard
              icon={Globe}
              title="Connect a Browser"
              description="Install the Chrome extension so Rabta can manage tabs alongside each task."
              actionLabel="Go to Connectors"
              onAction={() => setView("connectors")}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!(connectors.length > 0 && tasks.length > 0) && (
            <GettingStarted
              hasConnector={connectors.length > 0}
              hasTask={tasks.length > 0}
              onConnect={() => setView("connectors")}
              onNewCapsule={() => {
                requestNewTask();
                setView("capsules");
              }}
            />
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <StatCard icon={FolderGit2} label={projects.length === 1 ? "Project" : "Projects"} value={projects.length} />
            <StatCard
              icon={Plug}
              label="Connected Apps"
              value={connectedCount}
              accent={connectedCount > 0 && openCount === 0}
            />
            <StatCard
              icon={ListChecks}
              label={openCount === 1 ? "Open Task" : "Open Tasks"}
              value={openCount}
              accent={openCount > 0}
            />
          </div>

          {activeTask && (
            <Card className="relative overflow-hidden border-l-2 border-l-primary p-4">
              {/* Faint tangerine wash so the "you are here" anchor reads as the
                  emotional centre of the dashboard, not a quiet aside. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/[0.06] to-transparent"
              />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Play className="size-4 fill-current" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-label font-medium uppercase tracking-widest text-muted-foreground">
                    Active Task
                  </p>
                  <p className="mt-0.5 truncate text-card font-semibold text-foreground">{activeTask.title}</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => resumeTask(activeTask.id)}>
                  <Play className="size-3.5 fill-current" />
                  Resume
                </Button>
              </div>
            </Card>
          )}

          {continueProjects.length > 0 && (
            <Card className="p-4">
              <SectionTitle action={<SectionLink label="All capsules" onClick={() => setView("capsules")} />}>
                Continue Working
              </SectionTitle>
              <div className="flex flex-col divide-y divide-border">
                {continueProjects.map((project) => {
                  const task = project.lastTaskId
                    ? tasks.find((candidate) => candidate.id === project.lastTaskId && candidate.projectId === project.id)
                    : undefined;

                  return (
                    <div key={project.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/5 text-primary">
                        <ProjectIcon icon={project.icon} className="size-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-foreground">{project.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-label text-muted-foreground">
                          <span>Opened {relativeTime(project.lastOpenedAt!)}</span>
                          {project.activeSeconds > 0 && (
                            <span>Last session {formatDuration(project.activeSeconds)}</span>
                          )}
                        </div>
                        {task && <p className="mt-1 truncate text-meta text-muted-foreground">{task.title}</p>}
                      </div>
                      {task ? (
                        <Button
                          size="sm"
                          aria-label={`Resume ${project.name}`}
                          onClick={() => resumeTask(task.id)}
                        >
                          <Play className="size-3.5 fill-current" />
                          Resume
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setView("capsules")}>
                          View Capsules
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle action={<SectionLink label="Manage" onClick={() => setView("connectors")} />}>
                Connected Apps
              </SectionTitle>
              {connectors.length === 0 ? (
                <p className="text-meta text-muted-foreground">
                  No tools linked yet — install the VS Code and Chrome extensions and they'll pair
                  with Rabta automatically.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {connectors.map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 text-meta">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          c.connected ? "bg-success" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
                      <Badge variant="outline" className="shrink-0 text-label">
                        {kindLabel(c.kind)}
                      </Badge>
                      <span className="shrink-0 text-label text-muted-foreground">
                        {c.connected ? "Connected" : "Offline"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle
                action={
                  recentLog.length > 0 ? (
                    <SectionLink label="View all" onClick={() => setView("activity")} />
                  ) : undefined
                }
              >
                Recent Activity
              </SectionTitle>
              {recentLog.length === 0 ? (
                <p className="text-meta text-muted-foreground">
                  Nothing yet — actions from your connectors will appear here.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {recentLog.map((e) => (
                    <div key={e.seq} className="flex items-center gap-2.5 text-meta">
                      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span className="min-w-0 flex-1 truncate text-foreground/90">
                        {describeEvent(e, resolveName).sentence}
                      </span>
                      <span className="shrink-0 text-label text-muted-foreground">
                        {relativeTime(e.at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
