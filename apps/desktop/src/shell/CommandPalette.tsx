import { invoke } from "@tauri-apps/api/core";
import { Fragment, useEffect, useState } from "react";
import { FolderGit2, Layers, Play, Plug, Settings, Sun } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useTheme } from "@/components/theme-provider";
import { ProjectIcon } from "@/lib/project-icons";
import { useStore, type NavKey, type Task } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";

/** Global ⌘K palette: a Raycast-style fuzzy search over every entity in the
 * app (nav sections, projects, tasks/capsules, connectors) plus a handful of
 * cross-page actions. cmdk does the fuzzy filtering itself against each
 * CommandItem's `value` — this component's job is just to feed it a
 * searchable list and wire each item to the page/store call that already
 * owns the real behavior. Mounted once at the shell level; App.tsx's keydown
 * listener and the Titlebar trigger both just flip the store's `commandOpen`
 * boolean that this dialog is bound to. */
export function CommandPalette() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const setView = useStore((s) => s.setView);
  const projects = useStore((s) => s.projects);
  const connectors = useStore((s) => s.connectors);
  const requestResume = useStore((s) => s.requestResume);
  const { theme, setTheme } = useTheme();

  const [tasks, setTasks] = useState<Task[]>([]);

  // Fetch the searchable task set once per palette open — not on every
  // keystroke. Projects are already in the store (Overview/Projects pages
  // populate it); tasks aren't kept anywhere globally, so this is the one
  // fetch the palette owns. Zero projects -> Promise.all([]) -> no tasks,
  // handled gracefully (no throw, just an empty Capsules group).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const projectIds = new Set(projects.map((project) => project.id));
    Promise.all(projects.map((p) => invoke<Task[]>("list_tasks", { projectId: p.id })))
      .then((perProject) => {
        if (!cancelled) setTasks(perProject.flat().filter((task) => projectIds.has(task.projectId)));
      })
      .catch((e) => console.error("command palette list_tasks failed:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (key: NavKey) => {
    setView(key);
    setOpen(false);
  };

  // The palette never runs activate_task itself — it only sets the pending
  // signal and jumps to Capsules, which is the same page that already owns
  // `resume()` behind its own Resume button. See CapsulesPage's effect on
  // `pendingResumeTaskId`.
  const resumeTask = (taskId: string) => {
    requestResume(taskId);
    go("capsules");
  };

  const projectName = (projectId: string) => projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.key} value={item.label} onSelect={() => go(item.key)}>
                <Icon />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {projects.length > 0 && (
          <CommandGroup heading="Projects">
            {projects.map((p) => (
              <CommandItem key={p.id} value={`project ${p.name}`} onSelect={() => go("projects")}>
                <ProjectIcon icon={p.icon} />
                <span>{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading="Capsules">
            {tasks.map((t) => {
              const pName = projectName(t.projectId);
              return (
                <Fragment key={t.id}>
                  <CommandItem value={`${pName} ${t.title}`} onSelect={() => go("capsules")}>
                    <Layers />
                    <span>{t.title}</span>
                    {pName && <span className="ml-auto text-xs text-muted-foreground">{pName}</span>}
                  </CommandItem>
                  <CommandItem
                    value={`resume ${pName} ${t.title}`}
                    onSelect={() => resumeTask(t.id)}
                  >
                    <Play />
                    <span>Resume {t.title}</span>
                    {pName && <span className="ml-auto text-xs text-muted-foreground">{pName}</span>}
                  </CommandItem>
                </Fragment>
              );
            })}
          </CommandGroup>
        )}

        {connectors.length > 0 && (
          <CommandGroup heading="Connectors">
            {connectors.map((c) => (
              <CommandItem key={c.id} value={`connector ${c.name}`} onSelect={() => go("connectors")}>
                <Plug />
                <span>{c.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          <CommandItem value="Register Project" onSelect={() => go("projects")}>
            <FolderGit2 />
            <span>Register Project</span>
          </CommandItem>
          <CommandItem value="New Task" onSelect={() => go("capsules")}>
            <Layers />
            <span>New Task</span>
          </CommandItem>
          <CommandItem
            value="Toggle Theme"
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            <Sun />
            <span>Toggle Theme</span>
          </CommandItem>
          <CommandItem value="Open Privacy / Settings" onSelect={() => go("settings")}>
            <Settings />
            <span>Open Privacy / Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
