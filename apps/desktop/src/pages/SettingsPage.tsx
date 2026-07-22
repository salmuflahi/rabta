import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
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
import { FoldMark, type FoldMarkState } from "@/shell/FoldMark";
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

// A real, always-running preview of the Resume fold — toggles two FoldMarks
// between "open" and "closed" on a shared interval, one per `variant`, so
// both candidate motions (see FoldMark.tsx) can be watched side by side on
// repeat. Users evaluate this in the native window and can't reach the dev
// component gallery, so this card is the only place to see the motion
// outside of an actual Resume ceremony — and the only place to pick which
// variant becomes the signature motion.
function ResumeAnimationPreview() {
  const [foldState, setFoldState] = useState<FoldMarkState>("open");

  useEffect(() => {
    const id = setInterval(() => {
      setFoldState((s) => (s === "open" ? "closed" : "open"));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <FoldMark state={foldState} size={96} variant="corner" />
          <p className="text-xs text-muted-foreground">Corner turn</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <FoldMark state={foldState} size={96} variant="squash" />
          <p className="text-xs text-muted-foreground">Fold shut</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Preview of the fold used in Resume.</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Resume animation</CardTitle>
            <CardDescription>How the Rabta mark folds when a session resumes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeAnimationPreview />
          </CardContent>
        </Card>

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
