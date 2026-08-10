import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toastErr } from "@/lib/toast";
import { useRestore } from "@/restore/RestoreExperience";
import type { RestoreTool } from "@/restore/types";
import { useStore } from "@/store";

/**
 * The developer-mode tools: a raw connector command console, and (dev
 * builds only) a scripted preview of the Restore Experience sheet.
 *
 * Lifted out of SettingsPage when Phase 2 rebuilt it as a section list —
 * these two panels were 245 of that file's 651 lines and have nothing to do
 * with the preference rows around them.
 */

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
export function RestoreExperiencePlayground() {
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
export function CommandSenderPanel() {
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
          className="min-h-[100px] w-full min-w-0 font-mono text-label"
        />
      </div>
      <Button variant="secondary" onClick={send} disabled={!target} className="self-start">
        Send command
      </Button>
      <pre className="max-h-48 min-h-[80px] min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-label text-muted-foreground">
        {result}
      </pre>
    </div>
  );
}

