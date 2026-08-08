import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Row } from "@/components/ui/row";
import { Section } from "@/components/ui/section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toastErr, toastOk } from "@/lib/toast";
import { useRestore } from "@/restore/RestoreExperience";
import type { RestoreTool } from "@/restore/types";
import { NAV_ITEMS } from "@/shell/nav";
import { useStore, type NavKey } from "@/store";

// ─── Small shared building blocks ────────────────────────────────────────────

/** Compact segmented control — a labelled group of mutually exclusive options.
 * Used for the small enumerated preferences (theme, motion) where a dropdown
 * would be heavier than the choice deserves. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-muted/40 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[7px] px-3 py-1 text-xs font-medium transition-colors duration-fast ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const theme = useStore((s) => s.prefs.theme);
  const motion = useStore((s) => s.prefs.motion);
  const rememberSidebar = useStore((s) => s.prefs.rememberSidebar);
  const setPref = useStore((s) => s.setPref);

  return (
    <Section label="Appearance">
      <Surface>
        <Field label="Theme" description="Follow the system or lock to light or dark.">
          <Segmented
            ariaLabel="Theme"
            value={theme}
            onChange={(v) => setPref("theme", v)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Field>
        <Field
          label="Motion"
          description="Reduce animation for a calmer, faster-feeling interface."
        >
          <Segmented
            ariaLabel="Motion"
            value={motion}
            onChange={(v) => setPref("motion", v)}
            options={[
              { value: "system", label: "System" },
              { value: "full", label: "Full" },
              { value: "reduced", label: "Reduced" },
            ]}
          />
        </Field>
        <Field
          label="Remember sidebar state"
          description="Reopen with the sidebar the way you left it — expanded or collapsed."
          htmlFor="remember-sidebar"
        >
          <Switch
            id="remember-sidebar"
            checked={rememberSidebar}
            onCheckedChange={(v) => setPref("rememberSidebar", v)}
          />
        </Field>
      </Surface>
    </Section>
  );
}

function BehaviorSection() {
  const landingPage = useStore((s) => s.prefs.landingPage);
  const resumeOnLaunch = useStore((s) => s.prefs.resumeOnLaunch);
  const keepCompleted = useStore((s) => s.prefs.keepCompleted);
  const focusMode = useStore((s) => s.prefs.focusMode);
  const setPref = useStore((s) => s.setPref);

  return (
    <Section label="Behavior">
      <Surface>
        <Field label="Open to" description="The section Rabta shows when it starts.">
          <Select value={landingPage} onValueChange={(v) => setPref("landingPage", v as NavKey)}>
            <SelectTrigger className="w-[168px]" aria-label="Default section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NAV_ITEMS.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Resume last capsule on launch"
          description="Reopen your most recent workspace automatically when Rabta starts."
          htmlFor="resume-on-launch"
        >
          <Switch
            id="resume-on-launch"
            checked={resumeOnLaunch}
            onCheckedChange={(v) => setPref("resumeOnLaunch", v)}
          />
        </Field>
        {/* Focus mode is destructive-feeling — it closes things. The
            description states the guarantees that make that safe, in the
            order a wary user needs them: what happens, what's protected
            first, then the one thing that is never touched. Never say more
            than the software actually does: it doesn't claim to protect
            unsaved changes, pinned tabs, or the last tab in a window here,
            because this copy only speaks to the two guarantees a resuming
            task itself provides. */}
        <Field
          label="Put away what isn't in the task"
          description="Resuming a task will put away what it does not want. Everything is saved to the outgoing task first, and a terminal that is running something is never closed."
          htmlFor="focus-mode"
        >
          <Switch
            id="focus-mode"
            checked={focusMode}
            onCheckedChange={(v) => setPref("focusMode", v)}
          />
        </Field>
        <Field
          label="Keep completed capsules"
          description="Leave finished capsules in the list instead of clearing them."
          htmlFor="keep-completed"
        >
          <Switch
            id="keep-completed"
            checked={keepCompleted}
            onCheckedChange={(v) => setPref("keepCompleted", v)}
          />
        </Field>
      </Surface>
    </Section>
  );
}

function ConnectorsSection() {
  const connectors = useStore((s) => s.connectors);
  const setView = useStore((s) => s.setView);
  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <Section label="Connectors">
      <Surface>
        <Field
          label="Connected tools"
          description={
            connectedCount > 0
              ? `${connectedCount} ${connectedCount === 1 ? "tool is" : "tools are"} connected right now.`
              : "No tools are connected yet."
          }
        >
          <Button variant="outline" size="sm" onClick={() => setView("connectors")}>
            Open Connectors
          </Button>
        </Field>
      </Surface>
    </Section>
  );
}

function PrivacySection() {
  const resetPrefs = useStore((s) => s.resetPrefs);

  async function revealDataFolder() {
    try {
      const dir = await appDataDir();
      await invoke("reveal_in_finder", { path: dir });
    } catch (e) {
      toastErr(e);
    }
  }

  function resetPreferences() {
    resetPrefs();
    toastOk("Preferences reset to defaults");
  }

  return (
    <Section label="Privacy & data">
      <p className="mb-3 text-body leading-relaxed text-muted-foreground">
        Rabta runs entirely on your Mac. There's no cloud account and no telemetry — nothing you
        work on ever leaves your device.
      </p>
      <Surface>
        <Field
          label="Data folder"
          description="Capsules, connector state, and preferences are stored here."
        >
          <Button variant="outline" size="sm" onClick={revealDataFolder}>
            Reveal in Finder
          </Button>
        </Field>
        <Field
          label="Reset preferences"
          description="Restore every setting on this page to its default. Your capsules and projects aren't touched."
        >
          <Button variant="outline" size="sm" onClick={resetPreferences}>
            Reset
          </Button>
        </Field>
      </Surface>
    </Section>
  );
}

const SHORTCUTS: { combo: string; description: string }[] = [
  { combo: "⌘K", description: "Open the command palette" },
  { combo: "⌘1–5", description: "Jump to a section" },
  { combo: "⌘,", description: "Open Settings" },
  { combo: "⌘\\", description: "Show or hide the sidebar" },
  { combo: "⌘N", description: "New project" },
  { combo: "⌘⇧N", description: "New capsule" },
  { combo: "⌘R", description: "Resume the last capsule" },
];

function ShortcutsSection() {
  return (
    <Section label="Keyboard shortcuts">
      <Surface>
        {SHORTCUTS.map((s) => (
          <Row key={s.combo} title={s.description} trailing={<Kbd>{s.combo}</Kbd>} />
        ))}
      </Surface>
    </Section>
  );
}

function DeveloperSection() {
  const developerMode = useStore((s) => s.prefs.developerMode);
  const setPref = useStore((s) => s.setPref);

  return (
    <Section label="Developer">
      <Surface>
        <Field
          label="Developer mode"
          description="Reveal the raw connector command console and other advanced tools."
          htmlFor="developer-mode"
        >
          <Switch
            id="developer-mode"
            checked={developerMode}
            onCheckedChange={(v) => setPref("developerMode", v)}
          />
        </Field>
      </Surface>

      {developerMode && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Command console</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Send a raw command directly to a connected client.
            </p>
          </div>
          <CommandSenderPanel />
          {import.meta.env.DEV && (
            <div className="flex flex-col gap-4 border-t border-border pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">Restore Experience preview</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Scripted previews of the restore sheet. Dev builds only.
                </p>
              </div>
              <RestoreExperiencePlayground />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function AboutSection() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled && typeof v === "string") setVersion(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Surface className="flex items-center gap-4 p-4">
      <img src={markUrl} alt="" className="size-11 shrink-0 rounded-[10px]" />
      <div className="min-w-0">
        <p className="text-card font-semibold text-foreground">
          Rabta{version && <span className="ml-2 text-sm font-normal text-muted-foreground">v{version}</span>}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A local-first shared brain for your dev tools.
        </p>
      </div>
    </Surface>
  );
}

// ─── Developer-only building blocks (unchanged behavior) ─────────────────────

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const PLAYGROUND_THREE_TOOLS: RestoreTool[] = [
  { id: "vscode", name: "VS Code", kind: "vscode" },
  { id: "chrome", name: "Chrome", kind: "chrome" },
  { id: "terminal", name: "Terminal", kind: "terminal" },
];

const PLAYGROUND_EIGHT_TOOLS: RestoreTool[] = [
  { id: "vscode", name: "VS Code", kind: "vscode" },
  { id: "chrome", name: "Chrome", kind: "chrome" },
  { id: "terminal", name: "Terminal", kind: "terminal" },
  { id: "git", name: "Git", kind: "git" },
  { id: "cursor", name: "Cursor", kind: "cursor" },
  { id: "figma", name: "Figma", kind: "figma" },
  { id: "slack", name: "Slack", kind: "slack" },
  { id: "notion", name: "Notion", kind: "notion" },
];

/**
 * DEV-only preview of the Restore Experience (see
 * docs/superpowers/specs/2026-07-22-restore-experience-spec.md). Presentation
 * only — every scenario below drives `useRestore()` with a SCRIPTED `run`
 * (no `invoke`), so this never touches the real Resume path (that path,
 * wired in `CapsulesPage`, uses the same `useRestore()` with a real `run`
 * that calls `activate_task`). Gated on `import.meta.env.DEV` so it's
 * stripped from production builds.
 */
function RestoreExperiencePlayground() {
  const { start, node } = useRestore();

  if (!import.meta.env.DEV) return null;

  const scenarios: { label: string; run: () => void }[] = [
    {
      label: "Idle",
      run: () => {
        // No-op: the idle baseline is simply "no sheet rendered".
      },
    },
    {
      label: "Slow successful restore",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async (emit) => {
            await delay(250);
            emit("vscode", "restoring");
            await delay(400);
            emit("vscode", "applied");
            await delay(50);
            emit("chrome", "restoring");
            await delay(400);
            emit("chrome", "applied");
            await delay(50);
            emit("terminal", "restoring");
            await delay(400);
            emit("terminal", "applied");
            return {
              overall: "success",
              tools: [
                { id: "vscode", status: "applied" },
                { id: "chrome", status: "applied" },
                { id: "terminal", status: "applied" },
              ],
            };
          },
        }),
    },
    {
      label: "Instant successful restore",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async () => ({
            overall: "success",
            tools: PLAYGROUND_THREE_TOOLS.map((t) => ({ id: t.id, status: "applied" as const })),
          }),
        }),
    },
    {
      label: "Partial restore",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async () => {
            await delay(300);
            return {
              overall: "partial",
              tools: [
                { id: "vscode", status: "applied" },
                { id: "chrome", status: "skipped", message: "On next reload" },
                { id: "terminal", status: "failed", message: "Couldn't restore" },
              ],
            };
          },
        }),
    },
    {
      label: "Complete failure",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async () => {
            await delay(300);
            throw new Error("Couldn't reach the connector service.");
          },
        }),
    },
    {
      label: "Eight tools",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_EIGHT_TOOLS,
          run: async () => {
            await delay(500);
            return {
              overall: "partial",
              tools: PLAYGROUND_EIGHT_TOOLS.map((t, i) => ({
                id: t.id,
                status: i % 4 === 3 ? ("skipped" as const) : ("applied" as const),
              })),
            };
          },
        }),
    },
    {
      label: "Reduced motion",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          forceReducedMotion: true,
          run: async () => {
            await delay(200);
            return {
              overall: "partial",
              tools: [
                { id: "vscode", status: "applied" },
                { id: "chrome", status: "skipped", message: "On next reload" },
                { id: "terminal", status: "failed", message: "Couldn't restore" },
              ],
            };
          },
        }),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        {scenarios.map((s) => (
          <Button key={s.label} variant="secondary" size="sm" onClick={s.run}>
            {s.label}
          </Button>
        ))}
      </div>
      {node}
    </div>
  );
}

// Raw connector command console. The `send_command` invoke and its exact
// { target, name, args } shape are preserved verbatim; only surfaced behind
// the Developer-mode toggle now.
function CommandSenderPanel() {
  const connectors = useStore((s) => s.connectors);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("workspace.open");
  const [args, setArgs] = useState('{"path": "/tmp/demo"}');
  const [result, setResult] = useState("");

  async function send() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      setResult("error: args is not valid JSON");
      return;
    }
    try {
      const res = await invoke("send_command", { target, name, args: parsed });
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setResult(`error: ${e}`);
    }
  }

  const connected = connectors.filter((c) => c.connected);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cmd-target">Target connector</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="cmd-target">
              <SelectValue placeholder="Pick a connector" />
            </SelectTrigger>
            <SelectContent>
              {connected.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cmd-name">Command name</Label>
          <Input
            id="cmd-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono"
            placeholder="workspace.open"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="cmd-args">Args (JSON)</Label>
        <Textarea
          id="cmd-args"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          className="min-h-[100px] w-full min-w-0 font-mono text-xs"
        />
      </div>
      <Button variant="secondary" onClick={send} disabled={!target} className="self-start">
        Send command
      </Button>
      <pre className="max-h-48 min-h-[80px] min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
        {result}
      </pre>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div>
      {/* The toolbar now names the page (Task 11); this stays for the
          existing findByText/getByText("Settings") contract and screen
          readers. The old subtitle ("Local preferences for this
          workspace.") is genuinely redundant, not moved: every section
          below is self-labelled (Appearance, Behavior, Privacy & data,
          ...), and "local" is already stated by the sidebar's own "Data
          stored locally" footer visible on every page — this line told the
          user nothing they couldn't already see. */}
      <h2 className="sr-only">Settings</h2>

      {/* Two balanced columns on wide viewports so the page fills the
          workspace instead of stranding the right side empty; a single
          readable column below xl. A real grid (not CSS multi-column) keeps
          each side in its own top-to-bottom reading order. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <div className="flex flex-col gap-6">
          <AppearanceSection />
          <BehaviorSection />
          <ConnectorsSection />
        </div>
        <div className="flex flex-col gap-6">
          <PrivacySection />
          <ShortcutsSection />
          <DeveloperSection />
        </div>
      </div>

      <div className="mt-6">
        <AboutSection />
      </div>
    </div>
  );
}
