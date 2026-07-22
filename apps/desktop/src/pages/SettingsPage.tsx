import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRestore } from "@/restore/RestoreExperience";
import type { RestoreTool } from "@/restore/types";
import { PageHeader } from "@/shell/PageHeader";
import { useStore } from "@/store";

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">Theme</p>
        <p className="text-xs text-muted-foreground">Switch between light and dark.</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={theme === "light" ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
          Light
        </span>
        <Switch
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          aria-label="Toggle dark mode"
        />
        <span className={theme === "dark" ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
          Dark
        </span>
      </div>
    </div>
  );
}

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
 * stripped from production builds; this is the successor preview to the
 * old fold-logo `ResumeAnimationPreview`/`ResumeCeremony` (removed).
 */
function RestoreExperiencePlayground() {
  const { start, node } = useRestore();

  if (!import.meta.env.DEV) return null;

  const scenarios: { label: string; run: () => void }[] = [
    {
      label: "Idle",
      run: () => {
        // No-op: the idle baseline is simply "no sheet rendered" — nothing
        // to trigger.
      },
    },
    {
      label: "Slow successful restore",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async (emit) => {
            // The spec's exact slow-success timeline (design testing only —
            // real integration uses actual data/timing, no scripted delays).
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
      label: "Three tools",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async () => {
            await delay(400);
            return {
              overall: "success",
              tools: PLAYGROUND_THREE_TOOLS.map((t) => ({ id: t.id, status: "applied" as const })),
            };
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
    {
      label: "Long project name",
      run: () =>
        start({
          subtitle: "the-really-quite-extraordinarily-long-monorepo-name-for-a-client-project-that-keeps-going",
          tools: PLAYGROUND_THREE_TOOLS,
          run: async () => {
            await delay(300);
            return {
              overall: "success",
              tools: PLAYGROUND_THREE_TOOLS.map((t) => ({ id: t.id, status: "applied" as const })),
            };
          },
        }),
    },
    {
      label: "Missing tool icon",
      run: () =>
        start({
          subtitle: "rabta-desktop",
          tools: [...PLAYGROUND_THREE_TOOLS, { id: "mystery", name: "Quantum Debugger", kind: "quantum-debugger" }],
          run: async () => {
            await delay(300);
            return {
              overall: "partial",
              tools: [
                ...PLAYGROUND_THREE_TOOLS.map((t) => ({ id: t.id, status: "applied" as const })),
                { id: "mystery", status: "skipped" as const },
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
      <p className="text-xs text-muted-foreground">
        Dev-only preview of the Restore Experience sheet — scripted runs, not wired to the real Resume flow.
      </p>
      {node}
    </div>
  );
}

// Ported from panels/CommandSender.tsx onto the design system — the
// `send_command` invoke and its exact { target, name, args } shape are
// preserved verbatim; only the raw <select>/<input>/<textarea> markup is
// swapped for the equivalent @/components/ui primitives.
function CommandSenderCard() {
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
          <Label htmlFor="cmd-target">Target Connector</Label>
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
          <Label htmlFor="cmd-name">Command Name</Label>
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
      <Button onClick={send} disabled={!target} className="self-start">
        Send Command
      </Button>
      <pre className="min-h-[80px] max-h-48 min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
        {result}
      </pre>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader eyebrow="PREFERENCES" title="Settings" subtitle="Local preferences for this workspace." />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Rabta looks on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <AppearanceSection />
          </CardContent>
        </Card>

        {import.meta.env.DEV && (
          <Card>
            <CardHeader>
              <CardTitle>Restore Experience (dev preview)</CardTitle>
              <CardDescription>
                Isolated preview of the signature restore sheet. Dev-only — stripped from production builds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RestoreExperiencePlayground />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>How your data is handled.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Rabta runs entirely on your machine (127.0.0.1). No cloud account, no telemetry, no code
              leaves your device.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advanced</CardTitle>
            <CardDescription>For debugging connectors. Sends a raw command directly to a connected client.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommandSenderCard />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
