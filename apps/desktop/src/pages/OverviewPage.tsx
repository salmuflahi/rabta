import { invoke } from "@tauri-apps/api/core";
import { FolderGit2, LayoutGrid, ListChecks, Plug, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/shell/PageHeader";
import { relativeTime } from "@/lib/humanize";
import { useStore, type Project, type Task } from "@/store";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
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

  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggregate open-task count from the same list_tasks invoke CapsulesPage
  // already uses — no new backend, just reused across pages.
  useEffect(() => {
    if (projects.length === 0) {
      setTasks([]);
      return;
    }
    Promise.all(projects.map((p) => invoke<Task[]>("list_tasks", { projectId: p.id })))
      .then((lists) => setTasks(lists.flat()))
      .catch((e) => console.error("list_tasks failed:", e));
  }, [projects]);

  const connectedCount = connectors.filter((c) => c.connected).length;
  const openCount = tasks.filter((t) => t.status === "open").length;
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const recentLog = [...log].slice(-5).reverse();

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

      {projects.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="Welcome to Rabta"
          description="Register a project to start tracking tasks, capsules, and connectors."
          action={<Button onClick={() => setView("projects")}>Register Project</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={FolderGit2} label={projects.length === 1 ? "Project" : "Projects"} value={projects.length} />
            <StatCard icon={Plug} label="Connectors Connected" value={connectedCount} />
            <StatCard icon={ListChecks} label={openCount === 1 ? "Open Task" : "Open Tasks"} value={openCount} />
          </div>

          {activeTask && (
            <Card className="border-l-2 border-l-primary p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Active Task</p>
              <p className="mt-1 font-medium text-foreground">{activeTask.title}</p>
            </Card>
          )}

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Recent Activity</p>
            {recentLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentLog.map((e) => (
                  <div key={e.seq} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{relativeTime(e.at)}</span>
                    <Badge variant="outline">{e.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
