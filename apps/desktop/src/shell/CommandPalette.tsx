import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Command as CommandPrimitive } from "cmdk";
import { Fragment, useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { saveCapsule } from "@/lib/capsule";
import { cn } from "@/lib/utils";
import { useStore, type NavKey, type Task } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";

/** With an empty query only the default-flagged items show: all of Go to,
 * all of Actions, and the first three capsules. Everything else is
 * reachable by typing. The handoff spells this out, and it is the
 * difference between a palette and a directory listing. */
const DEFAULT_CAPSULES = 3;

/** One palette row. The highlighted row takes the accent fill — this is the
 * one place in the app where an accent fill moves with the keyboard, and
 * it is exactly what the accent is for: the thing Enter will run. */
function Row({
  value,
  onSelect,
  icon,
  label,
  meta,
  shortcut,
}: {
  value: string;
  onSelect: () => void;
  icon: IconName;
  label: string;
  meta?: string;
  shortcut?: string;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-body outline-none",
        "text-foreground data-[selected=true]:bg-primary data-[selected=true]:text-white",
      )}
    >
      <Icon name={icon} className="size-[15px] shrink-0 opacity-90" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && (
        <span className="shrink-0 text-meta text-tertiary-foreground group-data-[selected=true]:text-white/75">
          {meta}
        </span>
      )}
      {shortcut && (
        <Kbd className="shrink-0 group-data-[selected=true]:bg-white/[.22] group-data-[selected=true]:text-white">
          {shortcut}
        </Kbd>
      )}
    </CommandPrimitive.Item>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className="px-2 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-tertiary-foreground"
    >
      {children}
    </CommandPrimitive.Group>
  );
}

/**
 * The ⌘K palette — Spotlight-shaped, per the handoff: 600px, 14px radius,
 * chrome colour behind a saturate/blur, 118px from the top, over a scrim.
 * A 50px search row with an `esc` pill, grouped results capped at 330px,
 * and a 31px footer that says what the search covers.
 *
 * Built on Radix Dialog + cmdk directly rather than the shared
 * `CommandDialog` primitive: that one centres its content, caps at
 * `max-w-lg` and draws a close ✕, none of which a Spotlight-shaped palette
 * wants. cmdk keeps the parts worth keeping — fuzzy matching, ↑↓ with the
 * highlighted row scrolled into view, Enter to run, hover to highlight.
 *
 * The palette never runs a task activation itself: Resume only sets the
 * pending signal and jumps to Capsules, which already owns that ceremony
 * behind its own button.
 */
export function CommandPalette() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const setView = useStore((s) => s.setView);
  const projects = useStore((s) => s.projects);
  const connectors = useStore((s) => s.connectors);
  const requestResume = useStore((s) => s.requestResume);
  const requestNewProject = useStore((s) => s.requestNewProject);
  const requestNewTask = useStore((s) => s.requestNewTask);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const selectCapsule = useStore((s) => s.selectCapsule);
  const selectProject = useStore((s) => s.selectProject);
  const selectConnector = useStore((s) => s.selectConnector);
  const setSettingsSection = useStore((s) => s.setSettingsSection);
  const { theme, setTheme } = useTheme();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");

  // Fetch the searchable task set once per palette open — not per keystroke.
  // Projects are already in the store; tasks aren't kept anywhere globally,
  // so this is the one fetch the palette owns.
  useEffect(() => {
    if (!open) return;
    // "Opening resets query and index and focuses the field — do it from the
    // open handler, not a lifecycle hook" is the handoff's advice for its
    // own vanilla prototype. Here the dialog mounts its content on open, so
    // cmdk resets the index and autofocuses the input for us; the query is
    // the one piece of state that outlives a close, so it's cleared here.
    setQuery("");
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

  const projectName = (projectId: string) => projects.find((p) => p.id === projectId)?.name ?? "";
  const searching = query.trim() !== "";
  const shownTasks = searching ? tasks : tasks.slice(0, DEFAULT_CAPSULES);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-140 data-[state=closed]:duration-100" />
        <DialogPrimitive.Content
          aria-label="Search or jump to anything"
          className={cn(
            "fixed left-1/2 top-[118px] z-50 w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2",
            "overflow-hidden rounded-[14px] bg-background/85 shadow-modal",
            "backdrop-blur-[40px] backdrop-saturate-[1.8]",
            "duration-120 data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-[.97] data-[state=open]:zoom-in-[.97]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <CommandPrimitive
            // cmdk's own filter already ranks by substring; the handoff asks
            // for a plain case-insensitive match across label + meta, which
            // is what each row's `value` carries.
            className="flex w-full flex-col overflow-hidden"
          >
            <div className="flex h-[50px] shrink-0 items-center gap-2.5 border-b-[0.5px] border-border px-4">
              <Icon name="search" className="size-4 shrink-0 text-tertiary-foreground" />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search or jump to…"
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-tertiary-foreground"
              />
              <Kbd className="shrink-0">esc</Kbd>
            </div>

            <CommandPrimitive.List className="max-h-[330px] overflow-y-auto overflow-x-hidden pb-1">
              <CommandPrimitive.Empty className="px-4 py-6 text-center text-sub text-muted-foreground">
                Nothing matches that.
              </CommandPrimitive.Empty>

              <Group heading="Go to">
                {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => (
                  <Row
                    key={item.key}
                    value={`go to ${item.label}`}
                    onSelect={() => go(item.key)}
                    icon={item.icon}
                    label={item.label}
                    shortcut={item.shortcut}
                  />
                ))}
              </Group>

              <Group heading="Actions">
                <Row
                  value="new capsule task"
                  onSelect={() => {
                    requestNewTask();
                    go("capsules");
                  }}
                  icon="plus"
                  label="New capsule"
                  shortcut="⌘⇧N"
                />
                <Row
                  value="add register project"
                  onSelect={() => {
                    requestNewProject();
                    go("projects");
                  }}
                  icon="projects"
                  label="Add project"
                  shortcut="⌘N"
                />
                {activeTaskId && (
                  <Row
                    value="capture save active capsule state"
                    onSelect={() => {
                      void saveCapsule(activeTaskId);
                      setOpen(false);
                    }}
                    icon="capture"
                    label="Capture the active capsule"
                    shortcut="⌘S"
                  />
                )}
                <Row
                  value="switch theme appearance dark light"
                  onSelect={() => {
                    setTheme(theme === "dark" ? "light" : "dark");
                    setOpen(false);
                  }}
                  icon="appearance"
                  label="Switch theme"
                  // The handoff asks this row to show the current theme as
                  // its meta, so the action reads as a state change rather
                  // than a mystery toggle.
                  meta={theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
                />
              </Group>

              {shownTasks.length > 0 && (
                <Group heading="Capsules">
                  {shownTasks.map((t) => {
                    const pName = projectName(t.projectId);
                    return (
                      <Fragment key={t.id}>
                        <Row
                          value={`${pName} ${t.title}`}
                          onSelect={() => {
                            selectCapsule(t.id);
                            go("capsules");
                          }}
                          icon="capsule"
                          label={t.title}
                          meta={pName || undefined}
                        />
                        <Row
                          value={`restore resume ${pName} ${t.title}`}
                          onSelect={() => {
                            selectCapsule(t.id);
                            requestResume(t.id);
                            go("capsules");
                          }}
                          icon="play"
                          label={`Restore ${t.title}`}
                          meta={pName || undefined}
                        />
                      </Fragment>
                    );
                  })}
                </Group>
              )}

              {searching && projects.length > 0 && (
                <Group heading="Projects">
                  {projects.map((p) => (
                    <Row
                      key={p.id}
                      value={`project ${p.name}`}
                      onSelect={() => {
                        selectProject(p.id);
                        go("projects");
                      }}
                      icon="projects"
                      label={p.name}
                    />
                  ))}
                </Group>
              )}

              {searching && connectors.length > 0 && (
                <Group heading="Connectors">
                  {connectors.map((c) => (
                    <Row
                      key={c.id}
                      value={`connector ${c.name}`}
                      onSelect={() => {
                        selectConnector(c.id);
                        go("connectors");
                      }}
                      icon="connectors"
                      label={c.name}
                      meta={c.connected ? "Connected" : "Offline"}
                    />
                  ))}
                </Group>
              )}

              {searching && (
                <Group heading="Settings">
                  {SETTINGS_SECTIONS.map((s) => (
                    <Row
                      key={s.id}
                      value={`settings ${s.label} ${s.title}`}
                      onSelect={() => {
                        setSettingsSection(s.id);
                        go("settings");
                      }}
                      icon={s.icon}
                      label={s.title}
                      meta="Settings"
                    />
                  ))}
                </Group>
              )}
            </CommandPrimitive.List>

            <div className="flex h-[31px] shrink-0 items-center justify-between border-t-[0.5px] border-border px-4 text-meta text-tertiary-foreground">
              <span>↑↓ Navigate · ↵ Open</span>
              {/* Privacy copy is a product requirement, not decoration. */}
              <span>Searches this Mac only</span>
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
