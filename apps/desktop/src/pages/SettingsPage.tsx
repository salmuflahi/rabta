import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Swatch } from "@/components/ui/swatch";
import { SwitchMac } from "@/components/ui/switch-mac";
import {
  CommandSenderPanel,
  DemoFixturePanel,
  RestoreExperiencePlayground,
} from "@/features/settings/DeveloperTools";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { toastErr, toastOk } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/shell/nav";
import { resolveTheme } from "@/theme/resolve";
import { useStore, type NavKey } from "@/store";

/**
 * One row of a settings card: a title (and optional description) on the
 * left, its control right-aligned, with a 0.5px divider between rows and
 * none after the last.
 *
 * `htmlFor` wires the title to a control that can take an id (switches,
 * inputs). Controls that are their own labelled group — Segmented, Swatch —
 * carry their own `ariaLabel` instead and pass no `htmlFor`, since pointing
 * a `<label>` at a radiogroup names nothing.
 */
function SettingRow({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const Title = htmlFor ? "label" : "p";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b-[0.5px] border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <Title htmlFor={htmlFor} className="block text-body text-foreground">
          {title}
        </Title>
        {description && (
          <p className="mt-0.5 text-meta leading-[1.45] text-tertiary-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center justify-self-end">{children}</div>
    </div>
  );
}

/** The grouped card every section's rows live in — 10px radius, hairline
 * ring, 16px horizontal padding, rows divided by their own bottom edges. */
function SettingCard({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-[10px] bg-card px-4 shadow-raised">{children}</div>;
}

/** A push button in a settings row — 24px, secondary, hairline. */
function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-6 rounded-md px-[11px] text-sub"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** A read-only value in a settings row. */
function RowValue({ children }: { children: React.ReactNode }) {
  return <span className="text-sub text-tertiary-foreground">{children}</span>;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function GeneralSection() {
  const landingPage = useStore((s) => s.prefs.landingPage);
  const resumeOnLaunch = useStore((s) => s.prefs.resumeOnLaunch);
  const setPref = useStore((s) => s.setPref);
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
    <SettingCard>
      <SettingRow title="Open to" description="The section Rabta shows when it starts.">
        <Select value={landingPage} onValueChange={(v) => setPref("landingPage", v as NavKey)}>
          <SelectTrigger className="h-6 w-40 rounded-md border-[0.5px] text-sub">
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
      </SettingRow>
      <SettingRow
        title="Resume last capsule on launch"
        description="Reopen your most recent workspace automatically when Rabta starts."
        htmlFor="resume-on-launch"
      >
        <SwitchMac
          id="resume-on-launch"
          checked={resumeOnLaunch}
          onCheckedChange={(v) => setPref("resumeOnLaunch", v)}
        />
      </SettingRow>
      {/* A plain value, not a button — there is no update mechanism to put
          behind one. */}
      <SettingRow title="Version">
        <RowValue>{version ? `Rabta ${version}` : "Rabta"}</RowValue>
      </SettingRow>
    </SettingCard>
  );
}

function AppearanceSection() {
  const theme = useStore((s) => s.prefs.theme);
  const accent = useStore((s) => s.prefs.accent);
  const motion = useStore((s) => s.prefs.motion);
  const statusbar = useStore((s) => s.prefs.statusbar);
  const rememberSidebar = useStore((s) => s.prefs.rememberSidebar);
  const setPref = useStore((s) => s.setPref);

  return (
    <SettingCard>
      <SettingRow title="Theme" description="Follow the system, or lock to light or dark.">
        <Segmented
          ariaLabel="Theme"
          value={theme}
          onChange={(v) => setPref("theme", v as typeof theme)}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </SettingRow>
      <SettingRow title="Accent" description="Repaints the whole app.">
        {/* The swatch renders each accent's per-theme hex, so it has to know
            which theme is actually resolved right now — not just the
            preference, which can be "system". */}
        <Swatch
          ariaLabel="Accent colour"
          value={accent}
          theme={resolveTheme(theme)}
          onChange={(id) => setPref("accent", id)}
        />
      </SettingRow>
      <SettingRow
        title="Status bar"
        description="The footer strip reporting connectors and last activity."
        htmlFor="statusbar"
      >
        <SwitchMac id="statusbar" checked={statusbar} onCheckedChange={(v) => setPref("statusbar", v)} />
      </SettingRow>
      <SettingRow
        title="Motion"
        description="Reduce animation, or follow the system setting."
      >
        <Segmented
          ariaLabel="Motion"
          value={motion}
          onChange={(v) => setPref("motion", v as typeof motion)}
          options={[
            { value: "system", label: "System" },
            { value: "full", label: "Full" },
            { value: "reduced", label: "Reduced" },
          ]}
        />
      </SettingRow>
      <SettingRow
        title="Remember the sidebar"
        description="Keep the sidebar collapsed or expanded across launches."
        htmlFor="remember-sidebar"
      >
        <SwitchMac
          id="remember-sidebar"
          checked={rememberSidebar}
          onCheckedChange={(v) => setPref("rememberSidebar", v)}
        />
      </SettingRow>
    </SettingCard>
  );
}

function CapsulesSection() {
  const keepCompleted = useStore((s) => s.prefs.keepCompleted);
  const focusMode = useStore((s) => s.prefs.focusMode);
  const setPref = useStore((s) => s.setPref);

  return (
    <SettingCard>
      <SettingRow
        title="Keep completed capsules"
        description="Show finished capsules in the Open list too, struck through."
        htmlFor="keep-completed"
      >
        <SwitchMac
          id="keep-completed"
          checked={keepCompleted}
          onCheckedChange={(v) => setPref("keepCompleted", v)}
        />
      </SettingRow>
      {/* Focus mode is destructive-feeling — it closes things. The
          description states the guarantees that make that safe, in the
          order a wary user needs them: what happens, what's protected
          first, then the one thing that is never touched. Kept verbatim
          through Phase 2's rebuild: never say more than the software
          actually does, and never say less about what it will close. */}
      <SettingRow
        title="Put away what isn't in the task"
        description="Resuming a task will put away what it does not want. Everything is saved to the outgoing task first, and a terminal that is running something is never closed."
        htmlFor="focus-mode"
      >
        <SwitchMac id="focus-mode" checked={focusMode} onCheckedChange={(v) => setPref("focusMode", v)} />
      </SettingRow>
    </SettingCard>
  );
}

function ConnectorsSection() {
  const connectors = useStore((s) => s.connectors);
  const setView = useStore((s) => s.setView);
  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <SettingCard>
      <SettingRow
        title="Connected tools"
        description={
          connectedCount > 0
            ? `${connectedCount} ${connectedCount === 1 ? "tool is" : "tools are"} connected right now.`
            : "No tools are connected yet."
        }
      >
        <RowButton onClick={() => setView("connectors")}>Open Connectors</RowButton>
      </SettingRow>
    </SettingCard>
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

  return (
    <>
      <p className="mt-4 text-sub leading-[1.55] text-muted-foreground">
        Rabta runs entirely on your Mac. There's no cloud account and no telemetry — nothing you
        work on ever leaves your device.
      </p>
      <SettingCard>
        <SettingRow
          title="Data folder"
          description="Capsules, connector state and preferences are stored here."
        >
          <RowButton onClick={revealDataFolder}>Reveal in Finder</RowButton>
        </SettingRow>
        <SettingRow
          title="Reset preferences"
          description="Restore every setting on this page to its default. Your capsules and projects aren't touched."
        >
          <RowButton
            onClick={() => {
              resetPrefs();
              toastOk("Preferences reset to defaults");
            }}
          >
            Reset
          </RowButton>
        </SettingRow>
      </SettingCard>
    </>
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

/** Settings › Migrate. The sheet itself is mounted at the app root (so the
 * palette can open it too); this section is the two doors into it. */
function MigrateSection() {
  const openMigrate = useStore((s) => s.openMigrate);
  return (
    <>
      <p className="mt-4 text-sub leading-[1.55] text-muted-foreground">
        Move your capsules, projects and preferences to another Mac as one encrypted file. Sending
        copies — nothing is removed from this Mac.
      </p>
      <SettingCard>
        <SettingRow
          title="Send to another Mac"
          description="Write an encrypted .rabta bundle you can AirDrop or carry on a drive."
        >
          <RowButton onClick={() => openMigrate("send")}>Send…</RowButton>
        </SettingRow>
        <SettingRow
          title="Receive from another Mac"
          description="Open a bundle. You review exactly what lands here before anything is written."
        >
          <RowButton onClick={() => openMigrate("receive")}>Receive…</RowButton>
        </SettingRow>
      </SettingCard>
    </>
  );
}

function ShortcutsSection() {
  return (
    <SettingCard>
      {SHORTCUTS.map((s) => (
        <SettingRow key={s.combo} title={s.description}>
          <Kbd>{s.combo}</Kbd>
        </SettingRow>
      ))}
    </SettingCard>
  );
}

function DeveloperSection() {
  const developerMode = useStore((s) => s.prefs.developerMode);
  const setPref = useStore((s) => s.setPref);
  const consoleId = useId();

  return (
    <>
      <SettingCard>
        <SettingRow
          title="Developer mode"
          description="Reveal the raw connector command console and other advanced tools."
          htmlFor="developer-mode"
        >
          <SwitchMac
            id="developer-mode"
            checked={developerMode}
            onCheckedChange={(v) => setPref("developerMode", v)}
          />
        </SettingRow>
      </SettingCard>

      {developerMode && (
        <div className="mt-6 flex flex-col gap-4">
          <div>
            <p id={consoleId} className="text-card-title font-590 text-foreground">
              Command console
            </p>
            <p className="mt-0.5 text-meta text-muted-foreground">
              Send a raw command directly to a connected client.
            </p>
          </div>
          <CommandSenderPanel />
          {import.meta.env.DEV && (
            <div className="flex flex-col gap-4 border-t-[0.5px] border-border pt-5">
              <div>
                <p className="text-card-title font-590 text-foreground">Restore Experience preview</p>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  Scripted previews of the restore sheet. Dev builds only.
                </p>
              </div>
              <RestoreExperiencePlayground />

              <div className="border-t-[0.5px] border-border pt-5">
                <p className="text-card-title font-590 text-foreground">Demo fixture</p>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  Populate an empty database for screenshots. Dev builds only.
                </p>
                <DemoFixturePanel />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Agents ──────────────────────────────────────────────────────────────────

interface AgentAccessStatus {
  enabled: boolean;
  socketPath: string;
}

/** The one line that connects Claude Code to the read-only MCP server. */
export const AGENT_INSTALL_COMMAND = "claude mcp add rabta -- npx -y @rabta/mcp";

function isAgentStatus(value: unknown): value is AgentAccessStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AgentAccessStatus).enabled === "boolean" &&
    typeof (value as AgentAccessStatus).socketPath === "string"
  );
}

function AgentsSection() {
  const [status, setStatus] = useState<AgentAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invoke("agent_access_status")
      .then((value) => {
        if (!cancelled && isAgentStatus(value)) setStatus(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await invoke("set_agent_access", { enabled });
      if (isAgentStatus(next)) setStatus(next);
      toastOk(enabled ? "Agent access on" : "Agent access off");
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(AGENT_INSTALL_COMMAND);
      toastOk("Copied");
    } catch (e) {
      toastErr(e);
    }
  }

  return (
    <>
      <p className="mt-4 text-sub leading-[1.55] text-muted-foreground">
        An agent on this Mac can already read your capsules through the Rabta MCP server. Agent
        access adds the other half, capture and restore, through a socket file in the data folder
        that only your user can open. Nothing here listens on a network port.
      </p>
      <SettingCard>
        <SettingRow
          title="Agent access"
          description="Let an agent capture and restore capsules, with the same receipt you get. Off closes the socket and forgets the secret."
          htmlFor="agent-access"
        >
          <SwitchMac
            id="agent-access"
            checked={status?.enabled ?? false}
            onCheckedChange={(v) => void toggle(v)}
          />
        </SettingRow>
        <SettingRow title="Socket" description={status?.socketPath ?? "Not available in this build."}>
          <RowValue>{status?.enabled ? "Listening" : "Closed"}</RowValue>
        </SettingRow>
        <SettingRow title="Connect Claude Code" description={AGENT_INSTALL_COMMAND}>
          <RowButton onClick={() => void copyInstall()}>Copy command</RowButton>
        </SettingRow>
      </SettingCard>
    </>
  );
}

// ─── The section list ────────────────────────────────────────────────────────

/** Which component renders each section's rows, keyed by the section id in
 * `SETTINGS_SECTIONS`. The section *metadata* (label, heading, glyph) lives
 * in features/settings/sections.ts so the command palette can offer the
 * sections as search targets without importing this page. */
const RENDERERS: Record<string, () => React.ReactNode> = {
  general: () => <GeneralSection />,
  appearance: () => <AppearanceSection />,
  capsules: () => <CapsulesSection />,
  connectors: () => <ConnectorsSection />,
  agents: () => <AgentsSection />,
  privacy: () => <PrivacySection />,
  migrate: () => <MigrateSection />,
  developer: () => <DeveloperSection />,
  shortcuts: () => <ShortcutsSection />,
};

/**
 * Settings — the handoff's section list plus one grouped card of rows.
 *
 * The page used to be two columns of every section at once, which meant
 * scrolling past Developer to reach Shortcuts and no way to link to a
 * single setting. A 216px section list makes each section a place.
 */
export function SettingsPage() {
  const section = useStore((s) => s.settingsSection);
  const setSection = useStore((s) => s.setSettingsSection);

  // Tolerates a stale id — the persisted section can name one that no
  // longer exists (Migrate will arrive and other sections may be renamed).
  const active = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-[216px_minmax(0,1fr)] overflow-hidden">
      <div
        data-settings-sections
        role="tablist"
        aria-label="Settings sections"
        aria-orientation="vertical"
        className="min-h-0 overflow-y-auto border-r-[0.5px] border-border px-2 pb-3 pt-2.5"
      >
        {SETTINGS_SECTIONS.map((s) => {
          const isActive = s.id === active.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSection(s.id)}
              className={cn(
                // Neutral selection, matching the sidebar and every other
                // list in the app — see Sidebar.tsx's NavGroup for the note
                // on why the handoff's accent fill isn't used here.
                "mt-px flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-body transition-colors duration-fast ease-standard",
                isActive
                  ? "bg-secondary font-510 text-secondary-foreground"
                  : "text-foreground hover:bg-hover",
              )}
            >
              <Icon name={s.icon} className="size-[15px] shrink-0 opacity-90" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div data-settings-detail className="min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-8 pb-11 pt-[30px]">
          {/* The Toolbar owns the view's <h1>; this names the section
              within it, at the handoff's 22/640 screen-title size. */}
          <h2 className="text-title font-640 text-foreground">{active.title}</h2>
          {RENDERERS[active.id]?.()}
        </div>
      </div>
    </div>
  );
}
