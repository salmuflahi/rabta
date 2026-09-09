import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwitchMac } from "@/components/ui/switch-mac";
import { Textarea } from "@/components/ui/textarea";
import { utilityUI } from "./ui";
import { NativeConfirmation, lines, sizeText, useNativeAction, type Confirmation } from "./native-shared";

// ----------------------------------------------------------------------------
// Input service
// ----------------------------------------------------------------------------

export type InputConfig = {
  scroll: { invertVertical: boolean; invertHorizontal: boolean };
  clickDebounce: { enabled: boolean; milliseconds: number };
  keyDebounce: { enabled: boolean; milliseconds: number };
  quitProtection: { enabled: boolean; mode: string; holdMilliseconds: number; includeCloseWindow: boolean; excludedApps: string[] };
  pastePlain: { enabled: boolean };
  cleaningMode: { enabled: boolean };
  focusFollowsMouse: { enabled: boolean; delayMilliseconds: number };
  mouseButtons: { button: number; shortcut: string }[];
  mouseNavigation: boolean;
  snippets: { trigger: string; text: string }[];
  excludedApps: string[];
};
type InputServiceStatus = { running: boolean; error: string | null; cleaning: boolean; expansions: number; lastEvent: string | null; accessibilityTrusted: boolean; inputMonitoring: boolean };
type InputState = { status: InputServiceStatus; config: InputConfig; supported: boolean };
export const defaultInputConfig = (): InputConfig => ({
  scroll: { invertVertical: false, invertHorizontal: false },
  clickDebounce: { enabled: false, milliseconds: 50 },
  keyDebounce: { enabled: false, milliseconds: 50 },
  quitProtection: { enabled: false, mode: "hold", holdMilliseconds: 1000, includeCloseWindow: false, excludedApps: [] },
  pastePlain: { enabled: false },
  cleaningMode: { enabled: false },
  focusFollowsMouse: { enabled: false, delayMilliseconds: 400 },
  mouseButtons: [],
  mouseNavigation: false,
  snippets: [],
  excludedApps: [],
});
const configActive = (c: InputConfig) => c.scroll.invertVertical || c.scroll.invertHorizontal || c.clickDebounce.enabled || c.keyDebounce.enabled || c.quitProtection.enabled || c.pastePlain.enabled || c.cleaningMode.enabled || c.focusFollowsMouse.enabled || c.mouseButtons.length > 0 || c.mouseNavigation || c.snippets.length > 0;
const CONSENT_KEY = "rabta.utility.input-consent";
export function InputService() {
  const [data, setData] = useState<InputState | null>(null), [config, setConfig] = useState<InputConfig>(defaultInputConfig()), [readError, setReadError] = useState(""), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [quitExclusions, setQuitExclusions] = useState(""), [exclusions, setExclusions] = useState(""), [consented, setConsented] = useState(() => { try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; } });
  const initialized = useRef(false);
  const action = useNativeAction();
  useEffect(() => {
    let cancelled = false, reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const next = await invoke<InputState>("utility_input_status");
        if (cancelled) return;
        setData(next); setReadError("");
        if (!initialized.current) { initialized.current = true; setConfig(next.config); setQuitExclusions(next.config.quitProtection.excludedApps.join("\n")); setExclusions(next.config.excludedApps.join("\n")); }
        else if (next.status.cleaning === false) setConfig((current) => current.cleaningMode.enabled && !next.config.cleaningMode.enabled ? { ...current, cleaningMode: { enabled: false } } : current);
      } catch (error) { if (!cancelled) setReadError(String(error)); }
      finally { reading = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const apply = (next: InputConfig, note?: string) => {
    const complete: InputConfig = { ...next, quitProtection: { ...next.quitProtection, excludedApps: lines(quitExclusions) }, excludedApps: lines(exclusions) };
    const send = () => void action.run<InputState>("utility_input_configure", { config: complete }, (result) => { setData(result); setConfig(result.config); if (result.status.error) return `Settings saved. ${result.status.error}`; return note ?? (result.status.running ? "Input service running with your settings." : "Input service is off."); });
    if (configActive(complete) && !consented) {
      setConfirm({ title: "Filter keyboard and mouse input?", description: "Rabta asks macOS for Accessibility access and then watches keyboard and mouse events while these settings are on, in every app. It changes only what you enable here, keeps nothing about what you type, and stops when you turn everything off or quit Rabta. Password fields are not exempt: pause snippet expansion before typing secrets.", action: "Allow and apply", perform: () => { setConsented(true); try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* session only */ } send(); } });
      return;
    }
    send();
  };
  const status = data?.status;
  const number = (value: string, fallback: number) => { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : fallback; };
  return <section className="rk-native-panel" aria-labelledby="input-title"><h3 id="input-title">Keyboard and mouse</h3>
    <p className="rk-native-description">Small fixes for input, applied system-wide through one explicit macOS event filter: reversed mouse wheels, bounce filtering, Cmd+Q protection, plain-text paste, extra mouse buttons, focus that follows the pointer, and typed snippet expansion. Everything is off until you turn it on and apply.</p>
    {readError && <p role="alert" className="rk-error">{readError}</p>}
    {!data ? <p role="status">Reading input settings…</p> : !data.supported ? <p className="rk-note">Input filtering requires the Rabta macOS app.</p> : <>
      <p className="rk-note">{status?.running ? "Filter running" : "Filter off"} · Accessibility {status?.accessibilityTrusted ? "allowed" : "not allowed"} · Input Monitoring {status?.inputMonitoring ? "allowed" : "not allowed"}{status?.expansions ? ` · ${status.expansions} snippet expansions this session` : ""}</p>
      {status?.error && <p role="alert" className="rk-error">{status.error}</p>}
      {status?.lastEvent && <p role="status" className="rk-note">{status.lastEvent}</p>}
      {!status?.accessibilityTrusted && <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<{ accessibilityTrusted: boolean }>("utility_input_request_access", {}, (result) => result.accessibilityTrusted ? "Accessibility access is allowed." : "macOS opened the Accessibility request. Allow Rabta, then apply your settings.")}>Request Accessibility access</Button></div>}
      <div className="rk-columns">
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="input-invert-vertical" checked={config.scroll.invertVertical} onCheckedChange={(checked) => setConfig({ ...config, scroll: { ...config.scroll, invertVertical: checked } })} /><label htmlFor="input-invert-vertical">Reverse mouse wheel vertically</label></div>
          <div className="rk-inline"><SwitchMac id="input-invert-horizontal" checked={config.scroll.invertHorizontal} onCheckedChange={(checked) => setConfig({ ...config, scroll: { ...config.scroll, invertHorizontal: checked } })} /><label htmlFor="input-invert-horizontal">Reverse mouse wheel horizontally</label></div>
          <p className="rk-note">Applies to wheel mice only. Trackpads and Magic Mouse keep their own direction.</p></div>
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="input-click-debounce" checked={config.clickDebounce.enabled} onCheckedChange={(checked) => setConfig({ ...config, clickDebounce: { ...config.clickDebounce, enabled: checked } })} /><label htmlFor="input-click-debounce">Filter double clicks from a bouncing mouse</label></div>
          <label htmlFor="input-click-window">Ignore a repeat click within · 5–500 ms</label><Input id="input-click-window" type="number" min={5} max={500} value={config.clickDebounce.milliseconds} onChange={(event) => setConfig({ ...config, clickDebounce: { ...config.clickDebounce, milliseconds: number(event.target.value, 50) } })} />
          <div className="rk-inline"><SwitchMac id="input-key-debounce" checked={config.keyDebounce.enabled} onCheckedChange={(checked) => setConfig({ ...config, keyDebounce: { ...config.keyDebounce, enabled: checked } })} /><label htmlFor="input-key-debounce">Filter repeated keys from a chattering keyboard</label></div>
          <label htmlFor="input-key-window">Ignore the same key again within · 5–500 ms</label><Input id="input-key-window" type="number" min={5} max={500} value={config.keyDebounce.milliseconds} onChange={(event) => setConfig({ ...config, keyDebounce: { ...config.keyDebounce, milliseconds: number(event.target.value, 50) } })} />
          <p className="rk-note">Holding a key still repeats normally. Very fast intentional double letters may be dropped at large windows.</p></div>
      </div>
      <div className="rk-columns">
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="input-quit" checked={config.quitProtection.enabled} onCheckedChange={(checked) => setConfig({ ...config, quitProtection: { ...config.quitProtection, enabled: checked } })} /><label htmlFor="input-quit">Protect Cmd+Q</label></div>
          <label htmlFor="input-quit-mode">Require</label><utilityUI.Select id="input-quit-mode" label="Require" value={config.quitProtection.mode === "double" ? "Press twice within a second" : "Hold the keys"} options={["Hold the keys", "Press twice within a second"]} onChange={(value) => setConfig({ ...config, quitProtection: { ...config.quitProtection, mode: value.startsWith("Press") ? "double" : "hold" } })} />
          <label htmlFor="input-quit-hold">Hold for · 500–5000 ms</label><Input id="input-quit-hold" type="number" min={500} max={5000} value={config.quitProtection.holdMilliseconds} onChange={(event) => setConfig({ ...config, quitProtection: { ...config.quitProtection, holdMilliseconds: number(event.target.value, 1000) } })} />
          <div className="rk-inline"><SwitchMac id="input-close" checked={config.quitProtection.includeCloseWindow} onCheckedChange={(checked) => setConfig({ ...config, quitProtection: { ...config.quitProtection, includeCloseWindow: checked } })} /><label htmlFor="input-close">Also protect Cmd+W</label></div>
          <label htmlFor="input-quit-exclusions">Apps without protection · bundle IDs, one per line</label><Textarea id="input-quit-exclusions" rows={3} className="resize-none" value={quitExclusions} onChange={(event) => setQuitExclusions(event.target.value)} /></div>
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="input-paste-plain" checked={config.pastePlain.enabled} onCheckedChange={(checked) => setConfig({ ...config, pastePlain: { enabled: checked } })} /><label htmlFor="input-paste-plain">Cmd+Shift+V pastes plain text</label></div>
          <p className="rk-note">The clipboard is restored right after the paste, formatting included.</p>
          <div className="rk-inline"><SwitchMac id="input-navigation" checked={config.mouseNavigation} onCheckedChange={(checked) => setConfig({ ...config, mouseNavigation: checked })} /><label htmlFor="input-navigation">Mouse buttons 4 and 5 go Back and Forward</label></div>
          <div className="rk-inline"><SwitchMac id="input-focus" checked={config.focusFollowsMouse.enabled} onCheckedChange={(checked) => setConfig({ ...config, focusFollowsMouse: { ...config.focusFollowsMouse, enabled: checked } })} /><label htmlFor="input-focus">Focus follows the pointer</label></div>
          <label htmlFor="input-focus-delay">After the pointer rests for · 100–5000 ms</label><Input id="input-focus-delay" type="number" min={100} max={5000} value={config.focusFollowsMouse.delayMilliseconds} onChange={(event) => setConfig({ ...config, focusFollowsMouse: { ...config.focusFollowsMouse, delayMilliseconds: number(event.target.value, 400) } })} />
          <p className="rk-note">Ignored while dragging or holding a modifier key, and never over the desktop or the menu bar.</p></div>
      </div>
      <details><summary>Extra mouse buttons</summary>
        <p className="rk-note">Map buttons 2 to 31 to a shortcut such as cmd+shift+4, ctrl+left or option+space. Button numbers count from 0 for the primary button.</p>
        {config.mouseButtons.map((mapping, index) => <div className="rk-inline" key={index}><label htmlFor={`input-button-${index}`}>Button</label><Input id={`input-button-${index}`} type="number" min={2} max={31} value={mapping.button} onChange={(event) => setConfig({ ...config, mouseButtons: config.mouseButtons.map((item, i) => i === index ? { ...item, button: number(event.target.value, 2) } : item) })} /><label htmlFor={`input-shortcut-${index}`}>Shortcut</label><Input id={`input-shortcut-${index}`} value={mapping.shortcut} onChange={(event) => setConfig({ ...config, mouseButtons: config.mouseButtons.map((item, i) => i === index ? { ...item, shortcut: event.target.value } : item) })} /><Button onClick={() => setConfig({ ...config, mouseButtons: config.mouseButtons.filter((_, i) => i !== index) })}>Remove mapping</Button></div>)}
        <Button disabled={config.mouseButtons.length >= 32} onClick={() => setConfig({ ...config, mouseButtons: [...config.mouseButtons, { button: 2, shortcut: "cmd+tab" }] })}>Add mouse button</Button>
      </details>
      <details><summary>Expanding snippets</summary>
        <p className="rk-note">Type a trigger such as ;sig anywhere and it is replaced with the text. {"{date}"}, {"{isodate}"}, {"{time}"} and {"{clipboard}"} are filled in. Expansion pastes through the clipboard and restores it afterwards.</p>
        {config.snippets.map((snippet, index) => <div className="rk-field" key={index}><div className="rk-inline"><label htmlFor={`input-trigger-${index}`}>Trigger</label><Input id={`input-trigger-${index}`} value={snippet.trigger} onChange={(event) => setConfig({ ...config, snippets: config.snippets.map((item, i) => i === index ? { ...item, trigger: event.target.value } : item) })} /><Button onClick={() => setConfig({ ...config, snippets: config.snippets.filter((_, i) => i !== index) })}>Remove snippet</Button></div><label htmlFor={`input-text-${index}`}>Expands to</label><Textarea id={`input-text-${index}`} rows={3} className="resize-none" value={snippet.text} onChange={(event) => setConfig({ ...config, snippets: config.snippets.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} /></div>)}
        <div className="rk-actions"><Button disabled={config.snippets.length >= 200} onClick={() => setConfig({ ...config, snippets: [...config.snippets, { trigger: ";", text: "" }] })}>Add snippet</Button>
          <Button onClick={() => { try { const saved = JSON.parse(localStorage.getItem("rabta.utility.snippets") ?? "[]") as { title?: string; text?: string }[]; const imported = saved.filter((item) => item.title && item.text).map((item) => ({ trigger: `;${String(item.title).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "snippet"}`, text: String(item.text) })).filter((item) => !config.snippets.some((existing) => existing.trigger === item.trigger)); setConfig({ ...config, snippets: [...config.snippets, ...imported].slice(0, 200) }); } catch { /* nothing saved */ } }}>Import from Text snippets</Button></div>
      </details>
      <div className="rk-field"><label htmlFor="input-exclusions">Apps left untouched · bundle IDs, one per line</label><Textarea id="input-exclusions" rows={3} className="resize-none" value={exclusions} onChange={(event) => setExclusions(event.target.value)} /></div>
      <div className="rk-actions"><Button className="rk-primary" disabled={action.busy} onClick={() => apply(config)}>Apply input settings</Button><Button disabled={action.busy || !status?.running} onClick={() => void action.run<InputState>("utility_input_stop", {}, (result) => { setData(result); setConfig(result.config); setQuitExclusions(""); setExclusions(""); return "Input filter stopped. macOS delivers every event unchanged."; })}>Turn everything off</Button></div>
      <div className="rk-field" style={{ marginTop: 16 }}><h4>Cleaning mode</h4><p className="rk-note">Locks the keyboard so you can wipe it. Press Escape three times within two seconds, or use the button here, to unlock. The pointer keeps working.</p>
        <div className="rk-actions">{!config.cleaningMode.enabled ? <Button disabled={action.busy} onClick={() => setConfirm({ title: "Lock the keyboard for cleaning?", description: "Every key press is ignored until you press Escape three times within two seconds or choose Unlock keyboard here. Unsaved work in other apps is not affected; keys are simply not delivered.", action: "Lock keyboard", perform: () => apply({ ...config, cleaningMode: { enabled: true } }, "Keyboard locked. Escape three times, or Unlock keyboard, ends it.") })}>Lock keyboard</Button> : <Button className="rk-primary" disabled={action.busy} onClick={() => apply({ ...config, cleaningMode: { enabled: false } }, "Keyboard unlocked.")}>Unlock keyboard</Button>}</div></div>
    </>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// App behaviors: auto-quit and the Music block
// ----------------------------------------------------------------------------

type WatcherSettings = { autoQuit: { enabled: boolean; graceSeconds: number; excludedApps: string[] }; musicBlock: { enabled: boolean; allowUntil: number | null } };
type WatcherStatus = { settings: WatcherSettings; events: { at: number; message: string }[]; active: boolean; error: string | null };
export function AppBehaviors() {
  const [data, setData] = useState<WatcherStatus | null>(null), [grace, setGrace] = useState("20"), [exclusions, setExclusions] = useState(""), [readError, setReadError] = useState(""), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const initialized = useRef(false);
  const action = useNativeAction();
  useEffect(() => {
    let cancelled = false, reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try { const next = await invoke<WatcherStatus>("utility_watchers_status"); if (!cancelled) { setData(next); setReadError(""); if (!initialized.current) { initialized.current = true; setGrace(String(next.settings.autoQuit.graceSeconds)); setExclusions(next.settings.autoQuit.excludedApps.join("\n")); } } }
      catch (error) { if (!cancelled) setReadError(String(error)); }
      finally { reading = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const save = (patch: { autoQuit?: Partial<WatcherSettings["autoQuit"]>; musicBlock?: Partial<WatcherSettings["musicBlock"]> }, note: string) => {
    if (!data) return;
    const settings: WatcherSettings = { autoQuit: { ...data.settings.autoQuit, graceSeconds: Number(grace), excludedApps: lines(exclusions), ...(patch.autoQuit ?? {}) }, musicBlock: { ...data.settings.musicBlock, ...(patch.musicBlock ?? {}) } };
    void action.run<WatcherStatus>("utility_watchers_configure", { settings }, (next) => { setData(next); return note; });
  };
  return <section className="rk-native-panel" aria-labelledby="behaviors-title"><h3 id="behaviors-title">App behaviors</h3>
    <p className="rk-native-description">Quit apps that have closed their last window, and keep the Music app from opening on its own. Both ask apps to quit normally, so an unsaved document still gets its prompt.</p>
    {readError && <p role="alert" className="rk-error">{readError}</p>}
    {!data ? <p role="status">Reading app behaviors…</p> : <>
      <div className="rk-columns">
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="behavior-autoquit" checked={data.settings.autoQuit.enabled} onCheckedChange={(checked) => { if (!checked) { save({ autoQuit: { enabled: false } }, "Auto-quit off."); return; } setConfirm({ title: "Quit apps when their last window closes?", description: "Rabta checks running apps every two seconds. An app that showed windows and then has none for the waiting period is asked to quit, once. Menu bar apps, macOS components and excluded apps are never touched.", action: "Turn on auto-quit", perform: () => save({ autoQuit: { enabled: true } }, "Auto-quit on.") }); }} /><label htmlFor="behavior-autoquit">Quit apps after their last window closes</label></div>
          <label htmlFor="behavior-grace">Wait · 5–600 seconds</label><Input id="behavior-grace" type="number" min={5} max={600} value={grace} onChange={(event) => setGrace(event.target.value)} />
          <label htmlFor="behavior-exclusions">Never quit · bundle IDs, one per line</label><Textarea id="behavior-exclusions" rows={3} className="resize-none" value={exclusions} onChange={(event) => setExclusions(event.target.value)} />
          <Button disabled={action.busy} onClick={() => save({}, "Auto-quit settings saved.")}>Save auto-quit settings</Button></div>
        <div className="rk-field"><div className="rk-inline"><SwitchMac id="behavior-music" checked={data.settings.musicBlock.enabled} onCheckedChange={(checked) => save({ musicBlock: { enabled: checked, allowUntil: null } }, checked ? "Music block on. Music that opens on its own is closed again." : "Music block off.")} /><label htmlFor="behavior-music">Close Music when it opens by itself</label></div>
          <p className="rk-note">A Music session that is already open stays open. Media keys and Bluetooth devices sometimes launch Music; this closes it within two seconds.</p>
          <Button disabled={action.busy || !data.settings.musicBlock.enabled} onClick={() => save({ musicBlock: { enabled: true, allowUntil: Math.floor(Date.now() / 1000) + 600 } }, "Music may open for the next 10 minutes.")}>Allow Music for 10 minutes</Button>
          {data.settings.musicBlock.allowUntil && data.settings.musicBlock.allowUntil * 1000 > Date.now() && <p className="rk-note">Allowed until {new Date(data.settings.musicBlock.allowUntil * 1000).toLocaleTimeString()}.</p>}</div>
      </div>
      {data.error && <p role="alert" className="rk-error">{data.error}</p>}
      {data.events.length > 0 && <div className="rk-output"><pre aria-label="Recent app behavior events">{data.events.map((event) => `${new Date(event.at * 1000).toLocaleTimeString()}  ${event.message}`).join("\n")}</pre></div>}
    </>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Processes
// ----------------------------------------------------------------------------

type ProcessEntry = { pid: number; parent: number; cpu: number; memoryBytes: number; user: string; command: string; name: string; protected: boolean; app: boolean };
export function ProcessManager() {
  const [data, setData] = useState<ProcessEntry[] | null>(null), [query, setQuery] = useState(""), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const action = useNativeAction();
  const refresh = () => void action.run<ProcessEntry[]>("utility_processes", {}, (next) => { setData(next); return `${next.length} processes listed, busiest first.`; });
  const end = (entry: ProcessEntry, force: boolean) => setConfirm({ title: force ? `Force quit ${entry.name}?` : `End ${entry.name}?`, description: force ? `${entry.name} stops immediately without a chance to save anything. Use this only when a normal quit did not work.` : entry.app ? `${entry.name} is asked to quit the normal way and may show an unsaved-document prompt.` : `${entry.name} (pid ${entry.pid}) receives a termination signal.`, action: force ? "Force quit" : entry.app ? "Ask to quit" : "End process", destructive: force, perform: () => void action.run<{ name: string; method: string; requested: boolean }>("utility_end_process", { pid: entry.pid, force }, (result) => { setData((current) => current?.filter((item) => item.pid !== entry.pid || result.method === "quit") ?? null); return result.method === "quit" ? `${result.name} was asked to quit. Refresh to confirm.` : `${result.name} ended.`; }) });
  const items = data?.filter((entry) => `${entry.name} ${entry.command} ${entry.user} ${entry.pid}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 120) ?? [];
  return <section className="rk-native-panel" aria-labelledby="processes-title"><h3 id="processes-title">Processes</h3>
    <p className="rk-native-description">See what is using this Mac and end a process that misbehaves. Apps are asked to quit first; force quit is a separate, confirmed step. macOS components stay running.</p>
    <Button disabled={action.busy} onClick={refresh}>Refresh processes</Button>
    {data && <><div className="rk-field"><label htmlFor="process-search">Search processes</label><Input id="process-search" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="max-h-96 overflow-y-auto"><table className="w-full text-left text-sm"><caption className="text-left">{items.length} of {data.length} processes</caption><thead><tr><th scope="col">Name</th><th scope="col">PID</th><th scope="col">CPU</th><th scope="col">Memory</th><th scope="col">Actions</th></tr></thead><tbody>
        {items.map((entry) => <tr key={entry.pid}><th scope="row" className="break-words">{entry.name}{entry.protected ? " · System" : entry.app ? " · App" : ""}</th><td>{entry.pid}</td><td>{entry.cpu.toFixed(1)}%</td><td>{sizeText(entry.memoryBytes)}</td><td>{!entry.protected && <div className="rk-actions"><Button disabled={action.busy} onClick={() => end(entry, false)}>{entry.app ? "Quit" : "End"}</Button><Button disabled={action.busy} onClick={() => end(entry, true)}>Force quit</Button></div>}</td></tr>)}
      </tbody></table></div></>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} destructive={confirm.destructive} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Quick launcher
// ----------------------------------------------------------------------------

type InstalledApp = { path: string; name: string; bundleId: string; version: string; system: boolean };
const FAVORITES_KEY = "rabta.utility.launcher";
export function QuickLauncher() {
  const [apps, setApps] = useState<InstalledApp[] | null>(null), [query, setQuery] = useState(""), [favorites, setFavorites] = useState<string[]>(() => { try { const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []; } catch { return []; } });
  const action = useNativeAction();
  const favorite = (path: string) => { const next = favorites.includes(path) ? favorites.filter((item) => item !== path) : [...favorites, path].slice(-24); setFavorites(next); try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* session only */ } };
  const open = (app: InstalledApp) => void action.run<{ pid: number }>("utility_launch_app", { path: app.path }, () => `${app.name} opened.`);
  const filtered = apps?.filter((app) => `${app.name} ${app.bundleId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 80) ?? [];
  const pinned = apps?.filter((app) => favorites.includes(app.path)) ?? [];
  return <section className="rk-native-panel" aria-labelledby="launcher-title"><h3 id="launcher-title">Quick launcher</h3>
    <p className="rk-native-description">Open any installed app from here and pin the ones you reach for. Pins stay on this Mac.</p>
    <Button disabled={action.busy} onClick={() => void action.run<InstalledApp[]>("utility_installed_apps", { includeSystem: true }, (next) => { setApps(next); return `${next.length} apps found.`; })}>Refresh apps</Button>
    {apps && <>{pinned.length > 0 && <div className="rk-actions" aria-label="Pinned apps">{pinned.map((app) => <Button key={app.path} disabled={action.busy} onClick={() => open(app)}>Open {app.name}</Button>)}</div>}
      <div className="rk-field"><label htmlFor="launcher-search">Search apps</label><Input id="launcher-search" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="max-h-72 space-y-2 overflow-y-auto">{filtered.map((app) => <article className="rounded-xl border p-3" key={app.path}><p className="break-words">{app.name}{app.version ? ` · ${app.version}` : ""}{app.system ? " · macOS" : ""}</p><div className="rk-actions"><Button disabled={action.busy} onClick={() => open(app)}>Open</Button><Button aria-pressed={favorites.includes(app.path)} onClick={() => favorite(app.path)}>{favorites.includes(app.path) ? "Unpin" : "Pin"}</Button></div></article>)}{!filtered.length && <p className="rk-empty">No matching apps.</p>}</div></>}
    {action.feedback}
  </section>;
}

// ----------------------------------------------------------------------------
// Uninstaller
// ----------------------------------------------------------------------------

type RelatedFile = { label: string; path: string; bytes: number; directory: boolean };
type TrashResult = { path: string; ok: boolean; error: string | null };
export function Uninstaller() {
  const [apps, setApps] = useState<InstalledApp[] | null>(null), [query, setQuery] = useState(""), [selected, setSelected] = useState<InstalledApp | null>(null), [related, setRelated] = useState<RelatedFile[] | null>(null), [checked, setChecked] = useState<string[]>([]), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const action = useNativeAction();
  const inspect = (app: InstalledApp) => { setSelected(app); setRelated(null); setChecked([]); void action.run<RelatedFile[]>("utility_app_related_files", { bundleId: app.bundleId, name: app.name }, (next) => { setRelated(next); return next.length ? `${next.length} related items found. None are selected.` : "No related files were found."; }); };
  const uninstall = () => { if (!selected) return; setConfirm({ title: `Move ${selected.name} to the Trash?`, description: `The app${checked.length ? ` and ${checked.length} selected related item${checked.length === 1 ? "" : "s"}` : ""} move to the Trash, where they can be restored until you empty it.\n\n${[selected.path, ...checked].join("\n")}`, action: "Move to Trash", destructive: true, perform: () => void action.run<TrashResult[]>("utility_uninstall_app", { path: selected.path, bundleId: selected.bundleId, name: selected.name, related: checked }, (results) => { const failed = results.filter((result) => !result.ok); setApps((current) => current?.filter((app) => app.path !== selected.path) ?? null); setSelected(null); setRelated(null); setChecked([]); return failed.length ? `${results.length - failed.length} moved to the Trash. ${failed.map((result) => `${result.path}: ${result.error ?? "not moved"}`).join(" ")}` : `${results.length} item${results.length === 1 ? "" : "s"} moved to the Trash.`; }) }); };
  const filtered = apps?.filter((app) => `${app.name} ${app.bundleId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 80) ?? [];
  return <section className="rk-native-panel" aria-labelledby="uninstall-title"><h3 id="uninstall-title">Uninstall an app</h3>
    <p className="rk-native-description">Move an app to the Trash together with the support files it left in your Library. Related items are listed unchecked; nothing leaves your Mac until you choose it and confirm. macOS apps and Rabta itself are not offered.</p>
    <Button disabled={action.busy} onClick={() => void action.run<InstalledApp[]>("utility_installed_apps", { includeSystem: false }, (next) => { setApps(next); setSelected(null); setRelated(null); return `${next.length} apps found.`; })}>Refresh apps</Button>
    {apps && <><div className="rk-field"><label htmlFor="uninstall-search">Search apps</label><Input id="uninstall-search" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="max-h-60 space-y-2 overflow-y-auto">{filtered.map((app) => <article className="rounded-xl border p-3" key={app.path}><p className="break-words">{app.name}{app.version ? ` · ${app.version}` : ""} · {app.bundleId || "no bundle ID"}</p><div className="rk-actions"><Button disabled={action.busy || !app.bundleId} aria-pressed={selected?.path === app.path} onClick={() => inspect(app)}>Inspect</Button></div></article>)}</div>
      {selected && related && <div className="mt-4 space-y-2"><p>Uninstall {selected.name}</p>{related.map((file) => <label key={file.path} className="flex items-start gap-2"><input type="checkbox" checked={checked.includes(file.path)} onChange={(event) => setChecked(event.target.checked ? [...checked, file.path] : checked.filter((item) => item !== file.path))} /><span className="break-words">{file.label} · {sizeText(file.bytes)}<br /><span className="rk-note">{file.path}</span></span></label>)}
        <div className="rk-actions"><Button disabled={action.busy} onClick={uninstall}>Move {selected.name}{checked.length ? ` and ${checked.length} item${checked.length === 1 ? "" : "s"}` : ""} to Trash</Button></div></div>}</>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} destructive confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Disk image installer
// ----------------------------------------------------------------------------

type OpenedImage = { image: string; mountPoint: string; apps: { name: string; path: string; installedAt: string | null }[]; packages: string[] };
export function DiskImageInstaller() {
  const [image, setImage] = useState<OpenedImage | null>(null), [app, setApp] = useState(""), [destination, setDestination] = useState("Applications"), [replace, setReplace] = useState(false), [eject, setEject] = useState(true), [trashImage, setTrashImage] = useState(false), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const action = useNativeAction();
  const choose = () => void action.task<OpenedImage | null>(async () => {
    const chosen = await invoke<{ cancelled: boolean; path?: string }>("utility_choose_file", { kind: "dmg" });
    if (chosen.cancelled || !chosen.path) return null;
    return invoke<OpenedImage>("utility_disk_image_open", { path: chosen.path });
  }, (opened) => { if (!opened) return "No disk image chosen."; setImage(opened); setApp(opened.apps[0]?.path ?? ""); return opened.apps.length ? `${opened.apps.length} app${opened.apps.length === 1 ? "" : "s"} found on the disk image.` : "No app bundle was found on this disk image."; });
  const selected = image?.apps.find((item) => item.path === app);
  const install = () => { if (!image || !selected) return; setConfirm({ title: `Install ${selected.name}?`, description: `${selected.name} is copied to ${destination === "Applications" ? "/Applications" : "your user Applications folder"}.${selected.installedAt ? ` The existing copy at ${selected.installedAt} ${replace ? "moves to the Trash first." : "stays; choose Replace to move it to the Trash."}` : ""}${eject ? " The disk image is ejected afterwards." : ""}${trashImage ? " The .dmg file moves to the Trash." : ""}`, action: "Install", perform: () => void action.run<{ installedPath: string; ejected: boolean; imageTrashed: boolean; warnings: string[] }>("utility_disk_image_install", { app: selected.path, destination: destination === "Applications" ? "applications" : "user", replace, eject, trashImage }, (result) => { if (result.ejected) setImage(null); return `${selected.name} installed at ${result.installedPath}.${result.ejected ? " Disk image ejected." : ""}${result.imageTrashed ? " Disk image moved to the Trash." : ""}${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`; }) }); };
  return <section className="rk-native-panel" aria-labelledby="dmg-title"><h3 id="dmg-title">Install from a disk image</h3>
    <p className="rk-native-description">Choose a .dmg, pick the app inside, and Rabta copies it to Applications, ejects the image and can move the download to the Trash. Gatekeeper still checks the app the first time it opens. Installer packages are listed but stay with the macOS Installer.</p>
    <div className="rk-actions"><Button disabled={action.busy} onClick={choose}>Choose disk image…</Button>{image && <Button disabled={action.busy} onClick={() => void action.run<void>("utility_disk_image_eject", {}, () => { setImage(null); return "Disk image ejected."; })}>Eject</Button>}</div>
    {image && <><p className="rk-note">{image.image} · mounted at {image.mountPoint}</p>{image.packages.length > 0 && <p className="rk-note">Installer packages found: {image.packages.join(", ")}. Open them from Finder to run the macOS Installer.</p>}
      {image.apps.length > 0 && <div className="rk-columns"><div className="rk-field"><label htmlFor="dmg-app">App</label><utilityUI.Select id="dmg-app" label="App" value={selected?.name ?? ""} options={image.apps.map((item) => item.name)} onChange={(name) => setApp(image.apps.find((item) => item.name === name)?.path ?? "")} />{selected?.installedAt && <p className="rk-note">Already installed at {selected.installedAt}.</p>}</div>
        <div className="rk-field"><label htmlFor="dmg-destination">Install into</label><utilityUI.Select id="dmg-destination" label="Install into" value={destination} options={["Applications", "My Applications folder"]} onChange={setDestination} />
          <div className="rk-inline"><SwitchMac id="dmg-replace" checked={replace} onCheckedChange={setReplace} /><label htmlFor="dmg-replace">Replace an existing copy (moves it to the Trash)</label></div>
          <div className="rk-inline"><SwitchMac id="dmg-eject" checked={eject} onCheckedChange={setEject} /><label htmlFor="dmg-eject">Eject the disk image afterwards</label></div>
          <div className="rk-inline"><SwitchMac id="dmg-trash" checked={trashImage} onCheckedChange={setTrashImage} /><label htmlFor="dmg-trash">Move the .dmg to the Trash</label></div></div></div>}
      <div className="rk-actions"><Button className="rk-primary" disabled={action.busy || !selected} onClick={install}>Install{selected ? ` ${selected.name}` : ""}</Button></div></>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Cleaner
// ----------------------------------------------------------------------------

const CLEANER_CATEGORIES: { id: string; label: string }[] = [
  { id: "caches", label: "App caches" }, { id: "logs", label: "Logs and diagnostic reports" }, { id: "xcode-derived", label: "Xcode DerivedData" }, { id: "simulator-caches", label: "Simulator caches" },
  { id: "npm-cache", label: "npm cache" }, { id: "cargo-cache", label: "Cargo registry cache" }, { id: "gradle-cache", label: "Gradle caches" }, { id: "installers", label: "Installers in Downloads" }, { id: "trash", label: "Trash" },
];
type CleanerEntry = { category: string; name: string; path: string; bytes: number; directory: boolean; modified: number | null };
type CleanerCategory = { id: string; label: string; description: string; root: string; present: boolean; permanentOnly: boolean; entries: CleanerEntry[]; totalBytes: number; truncated: boolean };
type RemovalReport = { results: { path: string; ok: boolean; error: string | null; bytes: number }[]; freedBytes: number; method: string };
export function Cleaner() {
  const [categories, setCategories] = useState<string[]>(["caches", "logs", "installers"]), [data, setData] = useState<CleanerCategory[] | null>(null), [checked, setChecked] = useState<string[]>([]), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const action = useNativeAction();
  const scan = () => void action.run<CleanerCategory[]>("utility_cleaner_scan", { categories }, (next) => { setData(next); setChecked([]); const total = next.reduce((sum, category) => sum + category.totalBytes, 0); return `Scan finished: ${sizeText(total)} across ${next.filter((category) => category.present).length} folders. Nothing is selected.`; });
  const selectedEntries = data?.flatMap((category) => category.entries.filter((entry) => checked.includes(entry.path)).map((entry) => ({ entry, category }))) ?? [];
  const selectedBytes = selectedEntries.reduce((sum, item) => sum + item.entry.bytes, 0);
  const remove = (permanent: boolean) => setConfirm({ title: permanent ? `Delete ${selectedEntries.length} item${selectedEntries.length === 1 ? "" : "s"} permanently?` : `Move ${selectedEntries.length} item${selectedEntries.length === 1 ? "" : "s"} to the Trash?`, description: `${sizeText(selectedBytes)} selected.${permanent ? " Permanent deletion cannot be undone." : " Items can be restored from the Trash until you empty it."}\n\n${selectedEntries.slice(0, 12).map((item) => item.entry.path).join("\n")}${selectedEntries.length > 12 ? `\n…and ${selectedEntries.length - 12} more` : ""}`, action: permanent ? "Delete permanently" : "Move to Trash", destructive: permanent, perform: () => void action.run<RemovalReport>("utility_cleaner_remove", { paths: selectedEntries.map((item) => item.entry.path), permanent }, (report) => { const failed = report.results.filter((result) => !result.ok); const removed = new Set(report.results.filter((result) => result.ok).map((result) => result.path)); setData((current) => current?.map((category) => ({ ...category, entries: category.entries.filter((entry) => !removed.has(entry.path)), totalBytes: category.entries.filter((entry) => !removed.has(entry.path)).reduce((sum, entry) => sum + entry.bytes, 0) })) ?? null); setChecked([]); return `${sizeText(report.freedBytes)} ${report.method === "trash" ? "moved to the Trash" : "deleted"}.${failed.length ? ` ${failed.length} item${failed.length === 1 ? "" : "s"} could not be removed: ${failed.map((result) => result.error ?? result.path).join("; ")}` : ""}`; }) });
  const needsPermanent = selectedEntries.some((item) => item.category.permanentOnly);
  return <section className="rk-native-panel" aria-labelledby="cleaner-title"><h3 id="cleaner-title">Free up space</h3>
    <p className="rk-native-description">Scan the folders where apps and developer tools keep regenerable files, review each item with its size, then move what you choose to the Trash. Nothing is removed automatically or on a schedule.</p>
    <div className="rk-actions" aria-label="Categories to scan">{CLEANER_CATEGORIES.map((category) => <label key={category.id} className="rk-inline"><input type="checkbox" checked={categories.includes(category.id)} onChange={(event) => setCategories(event.target.checked ? [...categories, category.id] : categories.filter((id) => id !== category.id))} /><span>{category.label}</span></label>)}</div>
    <div className="rk-actions"><Button className="rk-primary" disabled={action.busy || !categories.length} onClick={scan}>{action.busy ? "Scanning…" : "Scan"}</Button></div>
    {data && <>{data.map((category) => <details key={category.id} open={category.entries.length > 0}><summary>{category.label} · {category.present ? `${sizeText(category.totalBytes)} in ${category.entries.length} item${category.entries.length === 1 ? "" : "s"}` : "not present"}{category.truncated ? " · partial" : ""}</summary><p className="rk-note">{category.description} {category.root}</p>
      <div className="rk-actions">{category.entries.length > 0 && <Button onClick={() => setChecked(Array.from(new Set([...checked, ...category.entries.map((entry) => entry.path)])))}>Select all in {category.label}</Button>}</div>
      <div className="max-h-64 space-y-1 overflow-y-auto">{category.entries.map((entry) => <label key={entry.path} className="flex items-start gap-2"><input type="checkbox" checked={checked.includes(entry.path)} onChange={(event) => setChecked(event.target.checked ? [...checked, entry.path] : checked.filter((item) => item !== entry.path))} /><span className="break-words">{entry.name} · {sizeText(entry.bytes)}{entry.modified ? ` · ${new Date(entry.modified * 1000).toLocaleDateString()}` : ""}</span></label>)}</div></details>)}
      <p className="rk-note">{selectedEntries.length} selected · {sizeText(selectedBytes)}</p>
      <div className="rk-actions"><Button disabled={action.busy || !selectedEntries.length || needsPermanent} onClick={() => remove(false)}>Move selected to Trash</Button><Button disabled={action.busy || !selectedEntries.length} onClick={() => remove(true)}>Delete selected permanently</Button></div>
      {needsPermanent && <p className="rk-note">Items already in the Trash can only be deleted permanently.</p>}</>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} destructive={confirm.destructive} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Homebrew
// ----------------------------------------------------------------------------

type BrewStatus = { installed: boolean; path: string | null; version: string | null; busy: boolean };
type BrewPackage = { name: string; versions: string[]; kind: string };
type BrewOutdated = { name: string; installed: string; current: string; kind: string; pinned: boolean };
type BrewActionResult = { command: string; ok: boolean; output: string };
export function HomebrewPanel() {
  const [status, setStatus] = useState<BrewStatus | null>(null), [outdated, setOutdated] = useState<BrewOutdated[] | null>(null), [installed, setInstalled] = useState<BrewPackage[] | null>(null), [results, setResults] = useState<BrewPackage[] | null>(null), [term, setTerm] = useState(""), [last, setLast] = useState<BrewActionResult | null>(null), [confirm, setConfirm] = useState<Confirmation | null>(null);
  const action = useNativeAction();
  const brew = (verb: string, name: string | null, cask: boolean, description: string) => setConfirm({ title: `Run brew ${verb}${cask ? " --cask" : ""}${name ? ` ${name}` : ""}?`, description, action: "Run", destructive: verb === "uninstall", perform: () => void action.run<BrewActionResult>("utility_brew_action", { action: verb, name, cask }, (result) => { setLast(result); setOutdated(null); setInstalled(null); return result.ok ? `${result.command} finished.` : `${result.command} reported a problem. Read the output below.`; }) });
  return <section className="rk-native-panel" aria-labelledby="brew-title"><h3 id="brew-title">Homebrew</h3>
    <p className="rk-native-description">Search, install, upgrade and remove Homebrew packages with the exact command shown before it runs and its output shown after. Requires Homebrew from brew.sh; one action runs at a time.</p>
    <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<BrewStatus>("utility_brew_status", {}, (next) => { setStatus(next); return next.installed ? `${next.version ?? "Homebrew"} at ${next.path}.` : "Homebrew is not installed."; })}>Check Homebrew</Button>
      {status?.installed && <><Button disabled={action.busy} onClick={() => void action.run<BrewOutdated[]>("utility_brew_outdated", {}, (next) => { setOutdated(next); return next.length ? `${next.length} package${next.length === 1 ? "" : "s"} can be upgraded.` : "Everything is up to date."; })}>Check for upgrades</Button>
        <Button disabled={action.busy} onClick={() => void action.run<BrewPackage[]>("utility_brew_list", {}, (next) => { setInstalled(next); return `${next.length} packages installed.`; })}>List installed</Button>
        <Button disabled={action.busy} onClick={() => brew("update", null, false, "Refreshes Homebrew's package definitions. Nothing is installed or removed.")}>brew update</Button>
        <Button disabled={action.busy || !outdated?.length} onClick={() => brew("upgrade-all", null, false, `Upgrades every outdated package: ${outdated?.map((item) => item.name).join(", ")}.`)}>Upgrade all</Button>
        <Button disabled={action.busy} onClick={() => brew("cleanup", null, false, "Removes old versions and downloaded files Homebrew no longer needs.")}>brew cleanup</Button></>}</div>
    {status?.installed && <><div className="rk-field"><label htmlFor="brew-search">Search packages</label><div className="rk-inline"><Input id="brew-search" value={term} onChange={(event) => setTerm(event.target.value)} /><Button disabled={action.busy || !term.trim()} onClick={() => void action.run<BrewPackage[]>("utility_brew_search", { term: term.trim() }, (next) => { setResults(next); return `${next.length} result${next.length === 1 ? "" : "s"}.`; })}>Search</Button></div></div>
      {results && <div className="max-h-56 space-y-2 overflow-y-auto">{results.map((item) => <article className="rounded-xl border p-3" key={`${item.kind}-${item.name}`}><p>{item.name} · {item.kind}</p><div className="rk-actions"><Button disabled={action.busy} onClick={() => brew("install", item.name, item.kind === "cask", `Installs ${item.name} and its dependencies.`)}>Install</Button></div></article>)}{!results.length && <p className="rk-empty">No packages match.</p>}</div>}
      {outdated && outdated.length > 0 && <div className="max-h-56 space-y-2 overflow-y-auto"><p>Upgrades available</p>{outdated.map((item) => <article className="rounded-xl border p-3" key={`${item.kind}-${item.name}`}><p>{item.name} · {item.installed} → {item.current}{item.pinned ? " · pinned" : ""}</p><div className="rk-actions"><Button disabled={action.busy || item.pinned} onClick={() => brew("upgrade", item.name, item.kind === "cask", `Upgrades ${item.name} from ${item.installed} to ${item.current}.`)}>Upgrade</Button></div></article>)}</div>}
      {installed && <div className="max-h-56 space-y-2 overflow-y-auto"><p>Installed</p>{installed.map((item) => <article className="rounded-xl border p-3" key={`${item.kind}-${item.name}`}><p>{item.name} {item.versions.join(", ")} · {item.kind}</p><div className="rk-actions"><Button disabled={action.busy} onClick={() => brew("uninstall", item.name, item.kind === "cask", `Removes ${item.name}. Dependencies other packages still need stay installed.`)}>Uninstall</Button></div></article>)}</div>}
      {last && <div className="rk-output"><div className="rk-output-top"><span>{last.command}</span><span>{last.ok ? "Finished" : "Problem"}</span></div><pre aria-label="Homebrew output">{last.output.trim() || "(no output)"}</pre></div>}</>}
    {action.feedback}
    {confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} destructive={confirm.destructive} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}

// ----------------------------------------------------------------------------
// Updates
// ----------------------------------------------------------------------------

type UpdateReport = { updates: { source: string; name: string; detail: string }[]; errors: string[]; sources: string[] };
export function UpdateChecker() {
  const [report, setReport] = useState<UpdateReport | null>(null);
  const action = useNativeAction();
  return <section className="rk-native-panel" aria-labelledby="updates-title"><h3 id="updates-title">Updates</h3>
    <p className="rk-native-description">One check across macOS, Homebrew and the App Store command-line tool where they are installed. Installing macOS updates stays in System Settings; Homebrew upgrades run from the Homebrew panel.</p>
    <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<UpdateReport>("utility_check_updates", {}, (next) => { setReport(next); return next.updates.length ? `${next.updates.length} update${next.updates.length === 1 ? "" : "s"} found across ${next.sources.join(", ")}.` : `No updates found across ${next.sources.join(", ")}.`; })}>{action.busy ? "Checking…" : "Check for updates"}</Button><Button disabled={action.busy} onClick={() => void action.run<void>("utility_open_software_update", {}, () => "Software Update opened in System Settings.")}>Open Software Update</Button></div>
    {report && <>{report.updates.length > 0 && <table className="w-full text-left text-sm"><caption className="text-left">Available updates</caption><thead><tr><th scope="col">Source</th><th scope="col">Update</th><th scope="col">Details</th></tr></thead><tbody>{report.updates.map((item, index) => <tr key={index}><td>{item.source}</td><th scope="row">{item.name}</th><td>{item.detail}</td></tr>)}</tbody></table>}
      {report.errors.map((error) => <p role="alert" className="rk-error" key={error}>{error}</p>)}</>}
    {action.feedback}
  </section>;
}

// ----------------------------------------------------------------------------
// Screen recorder
// ----------------------------------------------------------------------------

type Display = { id: string; index: number; name: string; primary: boolean; scale: number; frame: { x: number; y: number; width: number; height: number } };
type RecorderStatus = { recording: boolean; path: string | null; startedAt: number | null; options: unknown; last: { path: string; bytes: number; seconds: number; ok: boolean; error: string | null } | null };
export function ScreenRecorder() {
  const [displays, setDisplays] = useState<Display[]>([]), [status, setStatus] = useState<RecorderStatus | null>(null), [target, setTarget] = useState("Display 1"), [region, setRegion] = useState({ x: "0", y: "0", width: "1280", height: "720" }), [cursor, setCursor] = useState(true), [clicks, setClicks] = useState(false), [audio, setAudio] = useState(false), [seconds, setSeconds] = useState("0"), [readError, setReadError] = useState("");
  const action = useNativeAction();
  useEffect(() => {
    let cancelled = false, reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try { const next = await invoke<RecorderStatus>("utility_recorder_status"); if (!cancelled) { setStatus(next); setReadError(""); } }
      catch (error) { if (!cancelled) setReadError(String(error)); }
      finally { reading = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const options = () => {
    const chosen = displays.find((display) => `${display.name} (${display.index})` === target);
    const parsed = Number.isInteger(Number(seconds)) && Number(seconds) >= 0 ? Number(seconds) : 0;
    if (target === "Custom region") return { region: { x: Number(region.x), y: Number(region.y), width: Number(region.width), height: Number(region.height) }, cursor, clicks, audio, seconds: parsed };
    return { display: chosen?.index ?? 1, cursor, clicks, audio, seconds: parsed };
  };
  const targets = [...displays.map((display) => `${display.name} (${display.index})`), "Custom region"];
  return <section className="rk-native-panel" aria-labelledby="recorder-title"><h3 id="recorder-title">Record the screen</h3>
    <p className="rk-native-description">Record a display or a region to a .mov in Movies/Rabta using macOS's own recorder. Optional microphone audio, cursor and click highlights. macOS asks for Screen Recording access the first time. Trim the result in Video &amp; audio converter.</p>
    {readError && <p role="alert" className="rk-error">{readError}</p>}
    <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<{ displays: Display[] }>("utility_displays", {}, (next) => { setDisplays(next.displays); const first = next.displays[0]; if (first) setTarget(`${first.name} (${first.index})`); return `${next.displays.length} display${next.displays.length === 1 ? "" : "s"} connected.`; })}>Refresh displays</Button></div>
    <div className="rk-columns"><div className="rk-field"><label htmlFor="recorder-target">Record</label><utilityUI.Select id="recorder-target" label="Record" value={targets.includes(target) ? target : targets[0] ?? ""} options={targets} onChange={setTarget} />
      {target === "Custom region" && <div className="rk-inline"><label htmlFor="recorder-x">X</label><Input id="recorder-x" type="number" value={region.x} onChange={(event) => setRegion({ ...region, x: event.target.value })} /><label htmlFor="recorder-y">Y</label><Input id="recorder-y" type="number" value={region.y} onChange={(event) => setRegion({ ...region, y: event.target.value })} /><label htmlFor="recorder-width">Width</label><Input id="recorder-width" type="number" value={region.width} onChange={(event) => setRegion({ ...region, width: event.target.value })} /><label htmlFor="recorder-height">Height</label><Input id="recorder-height" type="number" value={region.height} onChange={(event) => setRegion({ ...region, height: event.target.value })} /></div>}
      <label htmlFor="recorder-seconds">Stop after · seconds, 0 for manual</label><Input id="recorder-seconds" type="number" min={0} max={14400} value={seconds} onChange={(event) => setSeconds(event.target.value)} /></div>
      <div className="rk-field"><div className="rk-inline"><SwitchMac id="recorder-cursor" checked={cursor} onCheckedChange={setCursor} /><label htmlFor="recorder-cursor">Show the cursor</label></div><div className="rk-inline"><SwitchMac id="recorder-clicks" checked={clicks} onCheckedChange={setClicks} /><label htmlFor="recorder-clicks">Highlight clicks</label></div><div className="rk-inline"><SwitchMac id="recorder-audio" checked={audio} onCheckedChange={setAudio} /><label htmlFor="recorder-audio">Record microphone audio</label></div></div></div>
    <div className="rk-actions">{status?.recording ? <Button className="rk-primary" disabled={action.busy} onClick={() => void action.run<RecorderStatus>("utility_recorder_stop", {}, (next) => { setStatus(next); return next.last?.ok ? `Recording saved: ${next.last.path} (${sizeText(next.last.bytes)}).` : next.last?.error ?? "Recording stopped."; })}>Stop recording</Button> : <Button className="rk-primary" disabled={action.busy} onClick={() => void action.run<RecorderStatus>("utility_recorder_start", { options: options() }, (next) => { setStatus(next); return "Recording started."; })}>Start recording</Button>}
      {status?.last?.ok && <Button disabled={action.busy} onClick={() => void action.run<void>("reveal_in_finder", { path: status.last!.path }, () => "Shown in Finder.")}>Show last recording in Finder</Button>}</div>
    {status?.recording && <p role="status" className="rk-note">Recording since {status.startedAt ? new Date(status.startedAt * 1000).toLocaleTimeString() : "now"} to {status.path}.</p>}
    {status?.last && !status.recording && <p className="rk-note">Last recording: {status.last.ok ? `${status.last.path} · ${sizeText(status.last.bytes)} · ${status.last.seconds}s` : status.last.error}</p>}
    {action.feedback}
  </section>;
}

// ----------------------------------------------------------------------------
// Camera preview
// ----------------------------------------------------------------------------

type Cameras = { devices: { id: string; name: string; connected: boolean }[]; authorization: string; running: boolean };
export function CameraPreview() {
  const [data, setData] = useState<Cameras | null>(null), [device, setDevice] = useState("");
  const action = useNativeAction();
  const selected = data?.devices.find((item) => item.name === device) ?? data?.devices[0];
  return <section className="rk-native-panel" aria-labelledby="camera-title"><h3 id="camera-title">Camera preview</h3>
    <p className="rk-native-description">Check your framing before a call in a small floating window. The preview is never recorded or sent anywhere; closing the window stops the camera. macOS asks for Camera access the first time.</p>
    <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<Cameras>("utility_camera_devices", {}, (next) => { setData(next); if (!device && next.devices[0]) setDevice(next.devices[0].name); return next.devices.length ? `${next.devices.length} camera${next.devices.length === 1 ? "" : "s"} found · access ${next.authorization}.` : "No camera is connected."; })}>Refresh cameras</Button>
      <Button disabled={action.busy || !selected} onClick={() => selected && void action.run<{ running: boolean; name: string }>("utility_camera_start", { deviceId: selected.id }, (result) => { setData((current) => current ? { ...current, running: true } : current); return `${result.name} preview open.`; })}>Start preview</Button>
      <Button disabled={action.busy || !data?.running} onClick={() => void action.run<{ running: boolean }>("utility_camera_stop", {}, () => { setData((current) => current ? { ...current, running: false } : current); return "Camera preview closed."; })}>Stop preview</Button></div>
    {data && data.devices.length > 0 && <div className="rk-field"><label htmlFor="camera-device">Camera</label><utilityUI.Select id="camera-device" label="Camera" value={selected?.name ?? ""} options={data.devices.map((item) => item.name)} onChange={setDevice} /></div>}
    {data?.authorization === "denied" && <p role="alert" className="rk-error">Camera access is denied for Rabta. Allow it in System Settings → Privacy &amp; Security → Camera.</p>}
    {action.feedback}
  </section>;
}
