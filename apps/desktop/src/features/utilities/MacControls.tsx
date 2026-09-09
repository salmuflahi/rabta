import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwitchMac } from "@/components/ui/switch-mac";
import { utilityUI } from "./ui";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
type Status = {
  platform: string;
  awakeUntil: number | null;
  keepDisplay: boolean;
};
type Sound = { volume: number; inputVolume: number; muted: boolean };
type SystemInfo = {
  macos: string;
  memoryBytes: number;
  processor: string;
  battery: string;
  storage: string;
};
export function MacControls() {
  const [status, setStatus] = useState<Status | null>(null),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(""),
    [feedback, setFeedback] = useState<Record<string, string>>({}),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState("60"),
    [display, setDisplay] = useState(false),
    [sound, setSound] = useState<Sound | null>(null),
    [volume, setVolume] = useState("50"),
    [inputVolume, setInputVolume] = useState("50"),
    [lastInput, setLastInput] = useState(50),
    [info, setInfo] = useState<SystemInfo | null>(null),
    [capture, setCapture] = useState("");
  const native =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    const refresh = () => {
      if (document.hidden) return;
      invoke<Status>("utility_status")
        .then((s) => {
          if (!cancelled) {
            setStatus(s);
            setLoadError("");
          }
        })
        .catch((e) => {
          if (!cancelled) setLoadError(String(e));
        });
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [native]);
  const perform = async <T,>(
    panel: string,
    command: string,
    args: Record<string, unknown>,
    done: (data: T) => string,
  ) => {
    if (busy) return;
    setBusy(panel);
    setErrors((s) => ({ ...s, [panel]: "" }));
    setFeedback((s) => ({ ...s, [panel]: "Working…" }));
    try {
      const result = await invoke<T>(command, args);
      const note = done(result);
      setFeedback((s) => ({ ...s, [panel]: note }));
    } catch (e) {
      setFeedback((s) => ({ ...s, [panel]: "" }));
      setErrors((s) => ({ ...s, [panel]: String(e) }));
    } finally {
      setBusy("");
    }
  };
  const result = (panel: string) => (
    <p
      className={`rk-status ${errors[panel] ? "rk-error" : ""}`}
      role={errors[panel] ? "alert" : "status"}
    >
      {errors[panel] || feedback[panel] || ""}
    </p>
  );
  const soundResult = (next: Sound) => {
    setSound(next);
    setVolume(String(next.volume));
    setInputVolume(String(next.inputVolume));
    return `System volume: ${next.volume}%. Microphone input: ${next.inputVolume}%.${next.muted ? " Output is muted." : ""}`;
  };
  if (!native)
    return (
      <div className="rk-empty">
        <p>
          Mac controls run in the installed Rabta app.
        </p>
      </div>
    );
  if (!status)
    return (
      <div role="status" className="rk-empty">
        {loadError || "Connecting to this Mac…"}
      </div>
    );
  if (status.platform !== "macos")
    return (
      <div className="rk-empty">
        These system controls require macOS. All other workbench tools remain
        available.
      </div>
    );
  return (
    <div className="rk-native-stack">
      <section className="rk-native-panel" aria-labelledby="awake-title">
        <h3 id="awake-title">Keep awake</h3>
        <p className="rk-native-description">
          Let a download or long-running task finish. Stops automatically when
          the timer ends or Rabta quits.
        </p>
        <div className="rk-field">
          <label htmlFor="awake-duration">Minutes · 1–720</label>
          <Input
            id="awake-duration"
            type="number"
            min={1}
            max={720}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <div className="rk-inline">
          <SwitchMac
            id="awake-display"
            checked={display}
            onCheckedChange={setDisplay}
          />
          <label htmlFor="awake-display">Also keep the display awake</label>
        </div>
        <div className="rk-actions">
          <Button
            disabled={
              !!busy ||
              !Number.isInteger(Number(minutes)) ||
              Number(minutes) < 1 ||
              Number(minutes) > 720
            }
            className="rk-primary"
            onClick={() =>
              void perform<void>(
                "awake",
                "utility_keep_awake",
                { minutes: Number(minutes), keepDisplay: display },
                () => {
                  void invoke<Status>("utility_status")
                    .then(setStatus)
                    .catch((e) => setLoadError(String(e)));
                  return "Keep-awake session started.";
                },
              )
            }
          >
            {busy === "awake"
              ? "Updating…"
              : status.awakeUntil
                ? "Replace timer"
                : "Keep awake"}
          </Button>
          <Button
            disabled={!!busy || !status.awakeUntil}
            onClick={() =>
              void perform<void>("awake", "utility_stop_awake", {}, () => {
                setStatus({ ...status, awakeUntil: null });
                return "Normal sleep restored.";
              })
            }
          >
            Stop
          </Button>
        </div>
        {status.awakeUntil && (
          <p className="rk-note">
            Active until{" "}
            {new Date(status.awakeUntil * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
            .{" "}
            {status.keepDisplay ? "Display stays awake." : "Display may sleep."}{" "}
            Closing the lid still follows macOS sleep behavior.
          </p>
        )}
        {result("awake")}
      </section>
      <NativeWindowTools />
      <ClipboardHistory />
      <NativeAudioDevices />
      <ScreenTextCapture />
      <NativeSystemMonitor />
      <section className="rk-native-panel" aria-labelledby="sound-title">
        <h3 id="sound-title">Sound controls</h3>
        <p className="rk-native-description">
          Control the current system output and microphone input. External
          devices may manage their own volume.
        </p>
        <Button
          disabled={!!busy}
          onClick={() =>
            void perform<Sound>(
              "sound",
              "utility_sound_status",
              {},
              soundResult,
            )
          }
        >
          Read current levels
        </Button>
        {sound && (
          <>
            <div className="rk-columns" style={{ marginTop: 20 }}>
              <div className="rk-field">
                <label htmlFor="sound-volume">Output · 0–100%</label>
                <Input
                  id="sound-volume"
                  type="number"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                />
                <Button
                  disabled={
                    !!busy || !/^\d+$/.test(volume) || Number(volume) > 100
                  }
                  onClick={() =>
                    void perform<Sound>(
                      "sound",
                      "utility_set_sound",
                      { kind: "output", value: Number(volume) },
                      soundResult,
                    )
                  }
                >
                  Set output
                </Button>
              </div>
              <div className="rk-field">
                <label htmlFor="sound-input">Microphone input · 0–100%</label>
                <Input
                  id="sound-input"
                  type="number"
                  min={0}
                  max={100}
                  value={inputVolume}
                  onChange={(e) => setInputVolume(e.target.value)}
                />
                <Button
                  disabled={
                    !!busy ||
                    !/^\d+$/.test(inputVolume) ||
                    Number(inputVolume) > 100
                  }
                  onClick={() =>
                    void perform<Sound>(
                      "sound",
                      "utility_set_sound",
                      { kind: "input", value: Number(inputVolume) },
                      soundResult,
                    )
                  }
                >
                  Set input
                </Button>
              </div>
            </div>
            <div className="rk-actions">
              <Button
                disabled={!!busy}
                onClick={() =>
                  void perform<Sound>(
                    "sound",
                    "utility_set_sound",
                    { kind: "mute", value: sound.muted ? 0 : 1 },
                    soundResult,
                  )
                }
              >
                {sound.muted ? "Unmute output" : "Mute output"}
              </Button>
              <Button
                disabled={!!busy}
                onClick={() => {
                  if (sound.inputVolume > 0) setLastInput(sound.inputVolume);
                  void perform<Sound>(
                    "sound",
                    "utility_set_sound",
                    {
                      kind: "input",
                      value: sound.inputVolume === 0 ? lastInput : 0,
                    },
                    soundResult,
                  );
                }}
              >
                {sound.inputVolume === 0
                  ? "Restore microphone level"
                  : "Set microphone to zero"}
              </Button>
            </div>
            <p className="rk-note">
              Setting the input level to zero is not a hardware mute and does
              not revoke microphone access.
            </p>
          </>
        )}
        {result("sound")}
      </section>
      <section className="rk-native-panel" aria-labelledby="capture-title">
        <h3 id="capture-title">Capture a moment</h3>
        <p className="rk-native-description">
          Select an area, or press Space to choose a window. Saves a PNG to
          Pictures/Rabta. Escape cancels.
        </p>
        <div className="rk-actions">
          <Button
            disabled={!!busy}
            className="rk-primary"
            onClick={() =>
              void perform<string | null>(
                "capture",
                "utility_capture",
                {},
                (path) => {
                  setCapture(path ?? "");
                  return path
                    ? "Screenshot saved to Pictures/Rabta."
                    : "Capture cancelled.";
                },
              )
            }
          >
            {busy === "capture" ? "Select an area…" : "Take screenshot"}
          </Button>
          {capture && (
            <Button
              disabled={!!busy}
              onClick={() =>
                void perform<void>(
                  "capture",
                  "reveal_in_finder",
                  { path: capture },
                  () => "Opened in Finder.",
                )
              }
            >
              Show in Finder
            </Button>
          )}
        </div>
        {result("capture")}
      </section>
      <section className="rk-native-panel" aria-labelledby="system-title">
        <h3 id="system-title">This Mac, at a glance</h3>
        <p className="rk-native-description">
          Read the current hardware, battery and storage information when you
          need it.
        </p>
        <Button
          disabled={!!busy}
          onClick={() =>
            void perform<SystemInfo>(
              "system",
              "utility_system_info",
              {},
              (data) => {
                setInfo(data);
                return "System information refreshed.";
              },
            )
          }
        >
          {busy === "system" ? "Reading…" : "Refresh system info"}
        </Button>
        {info && (
          <>
            <dl>
              <dt>macOS</dt>
              <dd>{info.macos}</dd>
              <dt>Processor</dt>
              <dd>{info.processor}</dd>
              <dt>Installed memory</dt>
              <dd>{(info.memoryBytes / 1024 ** 3).toFixed(0)} GiB</dd>
            </dl>
            <div className="rk-output">
              <pre aria-label="Battery and storage information">
                {info.battery + "\n\n" + info.storage}
              </pre>
            </div>
          </>
        )}
        {result("system")}
      </section>
    </div>
  );
}

function useNativeAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async <T,>(command: string, args: Record<string, unknown>, done: (value: T) => string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { const data = await invoke<T>(command, args); if (mounted.current) setNotice(done(data)); }
    catch (error) { if (mounted.current) setError(String(error)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return { busy, run, feedback: <p className={`rk-status ${error ? "rk-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</p> };
}
function NativeConfirmation({ title, description, action, confirm, close }: { title: string; description: string; action: string; confirm: () => void; close: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
    <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
    <div className="rk-actions"><Button ref={cancel} onClick={close}>Cancel</Button><Button onClick={() => { close(); confirm(); }}>{action}</Button></div>
  </DialogContent></Dialog>;
}
type ClipboardEntry = { id: string; text: string; frontmostApp: string; capturedAt: number; pinned: boolean };
type ClipboardSettings = { enabled: boolean; paused: boolean; retentionHours: number; excludedApps: string[] };
type ClipboardSnapshot = { settings: ClipboardSettings; entries: ClipboardEntry[]; error: string | null };
export function ClipboardHistory() {
  const [data, setData] = useState<ClipboardSnapshot | null>(null), [query, setQuery] = useState(""), [retention, setRetention] = useState("1"), [exclusions, setExclusions] = useState("");
  const [readError, setReadError] = useState(""), [confirm, setConfirm] = useState<null | { title: string; description: string; action: string; perform: () => void }>(null);
  const initialized = useRef(false), search = useRef<HTMLInputElement>(null), revision = useRef(0);
  const action = useNativeAction();
  useEffect(() => {
    let cancelled = false, reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true; const current = revision.current;
      try {
        const next = await invoke<ClipboardSnapshot>("utility_clipboard_history");
        if (!cancelled && current === revision.current) { setData(next); setReadError(""); if (!initialized.current) { setExclusions(next.settings.excludedApps.join("\n")); setRetention(String(next.settings.retentionHours)); initialized.current = true; } }
      } catch (error) { if (!cancelled) setReadError(String(error)); }
      finally { reading = false; }
    };
    void refresh(); const interval = setInterval(() => void refresh(), 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const configure = (patch: Partial<ClipboardSettings>) => {
    if (!data) return;
    revision.current++;
    const updatePreferences = "retentionHours" in patch || "excludedApps" in patch;
    void action.run<ClipboardSnapshot>("utility_clipboard_configure", { settings: { ...data.settings, ...patch }, updatePreferences }, (next) => { revision.current++; setData(next); return !next.settings.enabled ? "History disabled and cleared." : updatePreferences ? `History settings saved.${next.settings.paused ? " Collection remains paused." : ""}` : next.settings.paused ? "History paused." : "History enabled for new text copies."; });
  };
  const change = (operation: string, id: string | null = null) => {
    revision.current++;
    void action.run<ClipboardSnapshot>("utility_clipboard_action", { action: operation, id }, (next) => { revision.current++; setData(next); return operation === "copy" ? "Copied. Paste in your chosen app." : operation === "clear" ? "History cleared." : "History updated."; });
  };
  const entries = data?.entries.filter((entry) => `${entry.text} ${entry.frontmostApp}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  return <section className="rk-native-panel" aria-labelledby="history-title"><h3 id="history-title">Clipboard history</h3>
    <p className="rk-native-description">Find text you copied earlier. Off until you enable it. Stored only in memory, with up to 100 entries; nothing is uploaded or restored after quitting Rabta.</p>
    {readError && <p role="alert" className="rk-error">{readError}</p>}
    {!data ? <p role="status">Reading history settings…</p> : <>
      <div className="rk-actions">
        {!data.settings.enabled ? <Button disabled={action.busy} onClick={() => setConfirm({ title: "Enable text clipboard history?", description: "Rabta will remember new text copies while it is open, including when this panel is closed. Copies can contain private information. Password-manager apps and concealed/transient clipboard content are excluded, but unmarked secrets copied elsewhere may be captured. Pause before copying sensitive information. All entries, including pins, expire after the selected retention period.", action: "Enable history", perform: () => configure({ enabled: true, paused: false, retentionHours: Number(retention), excludedApps: exclusions.split("\n").map((line) => line.trim()).filter(Boolean) }) })}>Enable text history</Button> : <>
          <Button disabled={action.busy} onClick={() => configure({ paused: !data.settings.paused })}>{data.settings.paused ? "Resume history" : "Pause history"}</Button>
          <Button disabled={action.busy} onClick={() => setConfirm({ title: "Disable and clear history?", description: "All remembered copies will be removed from Rabta. Your current system clipboard is unchanged.", action: "Disable and clear", perform: () => configure({ enabled: false }) })}>Disable history</Button>
        </>}
        <Button disabled={action.busy || !data.entries.length} onClick={() => setConfirm({ title: "Clear clipboard history?", description: "This removes all remembered entries, including pins. Your current system clipboard is unchanged.", action: "Clear history", perform: () => change("clear") })}>Clear history</Button>
      </div>
      <p className="rk-note">{!data.settings.enabled ? "Off" : data.settings.paused ? "Paused" : "Remembering new text copies"} · Pins stay at the top but still expire. Images and files are not collected.</p>
      <details><summary>Retention and app exclusions</summary><div className="rk-field"><label htmlFor="history-retention">Keep entries for</label><utilityUI.Select id="history-retention" label="Keep entries for" value={retention} options={["1", "8", "24"]} onChange={setRetention} /><p className="rk-note">Hours. Shortening retention removes older entries.</p></div>
        <div className="rk-field"><label htmlFor="history-exclusions">Excluded application bundle IDs · one per line</label><Textarea id="history-exclusions" value={exclusions} onChange={(event) => setExclusions(event.target.value)} className="resize-none" rows={6} /></div>
        <p className="rk-note">Common password-manager exclusions always apply. App exclusions use the frontmost app when Rabta checks the clipboard, up to half a second after a copy. Switching apps quickly can hide the original source; pause before copying secrets.</p>
        <Button disabled={action.busy || !data.settings.enabled} onClick={() => { const save = () => configure({ retentionHours: Number(retention), excludedApps: exclusions.split("\n").map((line) => line.trim()).filter(Boolean) }); if (Number(retention) < data.settings.retentionHours && data.entries.length) setConfirm({ title: "Shorten history retention?", description: "Entries older than the new retention period will be permanently removed, including pins.", action: "Save shorter retention", perform: save }); else save(); }}>Save history settings</Button>{data.settings.paused && <p className="rk-note">You can update these settings while collection remains paused.</p>}
      </details>
      {data.error && <p role="alert" className="rk-error">{data.error} History paused. Resolve the issue and resume.</p>}
      <div className="rk-field"><label htmlFor="history-search">Search remembered copies</label><div className="rk-inline"><Input ref={search} id="history-search" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <Button onClick={() => { setQuery(""); search.current?.focus(); }}>Clear search</Button>}</div></div>
      <p className="rk-note">{entries.length} of {data.entries.length} entries</p>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {!entries.length && <p className="rk-empty">{query ? "No matching copies. Try another search." : data.settings.enabled ? "New text copies will appear here." : "Enable history to remember new copies."}</p>}
        {entries.map((entry) => <article key={entry.id} className="rounded-xl border p-3"><p className="rk-note">{entry.pinned ? "Pinned · " : ""}{new Date(entry.capturedAt * 1000).toLocaleTimeString()} · {entry.frontmostApp}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words">{entry.text}</pre><div className="rk-actions">
          <Button disabled={action.busy} onClick={() => change("copy", entry.id)}>Copy</Button><Button disabled={action.busy} onClick={() => change("pin", entry.id)}>{entry.pinned ? "Unpin" : "Pin"}</Button>
          <Button disabled={action.busy} onClick={() => setConfirm({ title: "Delete this history entry?", description: "This removes the selected remembered copy. The current system clipboard is unchanged.", action: "Delete entry", perform: () => change("delete", entry.id) })}>Delete</Button>
        </div></article>)}
      </div>
    </>}{action.feedback}{confirm && <NativeConfirmation title={confirm.title} description={confirm.description} action={confirm.action} confirm={confirm.perform} close={() => setConfirm(null)} />}
  </section>;
}
type AudioDevices = { devices: { id: number; name: string; selected: boolean }[] };
function NativeAudioDevices() {
  const [data, setData] = useState<AudioDevices | null>(null); const action = useNativeAction();
  return <section className="rk-native-panel" aria-labelledby="output-title"><h3 id="output-title">Audio output</h3><p className="rk-native-description">Move system sound between your connected speakers, headphones and displays. Apps with their own output selection may keep using that device.</p>
    <Button disabled={action.busy} onClick={() => void action.run<AudioDevices>("utility_audio_devices", {}, (next) => { setData(next); return next.devices.length ? "Audio outputs refreshed." : "No connected audio outputs were found."; })}>Refresh outputs</Button>
    <div className="rk-actions">{data?.devices.map((device) => <Button key={device.id} disabled={action.busy || device.selected} onClick={() => void action.run<AudioDevices>("utility_audio_switch", { deviceId: device.id }, (next) => { setData(next); const current = next.devices.find((item) => item.selected); return current ? `System output: ${current.name}.` : "Output changed. Refresh to check the current device."; })}>{device.name}{device.selected ? " · Current" : ""}</Button>)}</div>{action.feedback}
  </section>;
}
type OCR = { text: string; codes: string[] };
export function ScreenTextCapture() {
  const [data, setData] = useState<OCR | null>(null); const action = useNativeAction();
  return <section className="rk-native-panel" aria-labelledby="ocr-title"><h3 id="ocr-title">Text from your screen</h3><p className="rk-native-description">Select an area to read text and QR/barcodes with Apple’s on-device recognition. Escape cancels. The temporary capture is deleted after processing; results stay here until you clear them or leave this screen.</p>
    <div className="rk-actions"><Button disabled={action.busy} onClick={() => void action.run<OCR | null>("utility_screen_ocr", {}, (next) => { if (!next) return "Capture cancelled."; setData(next); return next.text || next.codes.length ? "Recognition finished. Review the result before using it." : "No text or barcode was recognized. Try a sharper or larger selection."; })}>{action.busy ? "Select an area…" : "Extract screen text"}</Button><Button disabled={!data || action.busy} onClick={() => setData(null)}>Clear result</Button></div>
    {data && <><div className="rk-field"><label htmlFor="ocr-text">Recognized text · select to copy</label><Textarea id="ocr-text" rows={8} className="resize-none" readOnly value={data.text} /></div>{data.codes.length > 0 && <div className="rk-field"><label htmlFor="ocr-codes">Recognized barcode contents · select to copy</label><Textarea id="ocr-codes" rows={4} className="resize-none" readOnly value={data.codes.join("\n")} /><p className="rk-note">Barcode contents are shown as text. Links never open automatically.</p></div>}</>}{action.feedback}
  </section>;
}
type LiveMetrics = { cpuPercent: number | null; memoryTotal?: number; memoryUsed?: number; memoryCompressed?: number; swapUsed?: number; diskTotal?: number; diskAvailable?: number; battery?: { percent: number | null; charging: boolean; powerSource: string; minutesRemaining: number | null }; interfaces: { name: string; receivePerSecond: number | null; sendPerSecond: number | null }[] };
const sizeText = (bytes: number | null | undefined) => bytes == null ? "Unavailable" : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
export function NativeSystemMonitor() {
  const [live, setLive] = useState(false), [data, setData] = useState<LiveMetrics | null>(null), [error, setError] = useState(""), [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    if (!live) return;
    let cancelled = false, reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return; reading = true;
      try { const next = await invoke<LiveMetrics>("utility_live_metrics"); if (!cancelled) { setData(next); setError(""); if (next.cpuPercent != null) setSamples((values) => [...values.slice(-29), next.cpuPercent!]); } }
      catch (error) { if (!cancelled) { setError(String(error)); setLive(false); } }
      finally { reading = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [live]);
  return <section className="rk-native-panel" aria-labelledby="monitor-title"><h3 id="monitor-title">Live system monitor</h3><p className="rk-native-description">CPU, memory, disk space, network rates and battery from this Mac. Refreshes every two seconds while this panel is open and visible.</p>
    <Button onClick={() => { if (!live) { setSamples([]); setData(null); } setLive(!live); }}>{live ? "Pause monitor" : "Start monitor"}</Button><p className="rk-note">{live ? "Monitoring" : data ? "Paused · last sample shown" : "Off"}</p>
    {error && <p role="alert" className="rk-error">{error} Start the monitor to retry.</p>}
    {live && !data && <p role="status">Reading this Mac…</p>}
    {data && <><dl className="grid grid-cols-2 gap-2"><dt>CPU</dt><dd>{data.cpuPercent == null ? "Sampling…" : `${data.cpuPercent.toFixed(1)}%`}</dd><dt>Active + wired + compressed RAM</dt><dd>{sizeText(data.memoryUsed)} / {sizeText(data.memoryTotal)}</dd><dt>Compressed memory</dt><dd>{sizeText(data.memoryCompressed)}</dd><dt>Swap used</dt><dd>{sizeText(data.swapUsed)}</dd><dt>Home volume free space</dt><dd>{sizeText(data.diskAvailable)} / {sizeText(data.diskTotal)}</dd><dt>Battery</dt><dd>{data.battery ? `${data.battery.percent == null ? "Unknown" : `${data.battery.percent.toFixed(0)}%`} · ${data.battery.charging ? "Charging" : data.battery.powerSource}${data.battery.minutesRemaining ? ` · about ${data.battery.minutesRemaining} minutes` : ""}` : "No internal battery reported"}</dd></dl>
      {samples.length > 1 && <svg viewBox="0 0 300 64" role="img" aria-label={`CPU history, ${samples.length} recent readings, latest ${samples.at(-1)!.toFixed(1)} percent`} className="mt-3 h-20 w-full text-primary"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={samples.map((value, index) => `${index * 300 / (samples.length - 1)},${62 - value * .6}`).join(" ")} /></svg>}
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left">Network interfaces · live rates</caption><thead><tr><th scope="col">Interface</th><th scope="col">Download</th><th scope="col">Upload</th></tr></thead><tbody>{data.interfaces.map((item) => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.receivePerSecond == null ? "Sampling…" : `${sizeText(item.receivePerSecond)}/s`}</td><td>{item.sendPerSecond == null ? "Sampling…" : `${sizeText(item.sendPerSecond)}/s`}</td></tr>)}</tbody></table></div><p className="rk-note">VPNs and physical interfaces may count the same traffic. Rates are separate to avoid double-counting. RAM is an active-use estimate, not Activity Monitor’s memory-pressure reading.</p>
    </>}
  </section>;
}

type WindowTarget = { pid: number; app: string; index: number; title: string; windowId: number | null };
type WindowItem = { target: WindowTarget; minimized: boolean; appHidden: boolean; canClose: boolean; displayId: string | null };
type WindowInventory = { windows: WindowItem[]; displays: { id: string; name: string; primary: boolean }[]; warnings: string[] };
type WindowPlacement = { target: WindowTarget; app: string; title: string; x: number; y: number; width: number; height: number };
const windowLayouts = { "Left half": "left", "Right half": "right", "Maximize": "maximize", "Center": "center", "Top left quarter": "top-left", "Top right quarter": "top-right", "Bottom left quarter": "bottom-left", "Bottom right quarter": "bottom-right", "Left third": "left-third", "Center third": "center-third", "Right third": "right-third", "Top left sixth": "top-left-sixth", "Top center sixth": "top-center-sixth", "Top right sixth": "top-right-sixth", "Bottom left sixth": "bottom-left-sixth", "Bottom center sixth": "bottom-center-sixth", "Bottom right sixth": "bottom-right-sixth" };
function NativeWindowTools() {
  const [data, setData] = useState<WindowInventory | null>(null), [selected, setSelected] = useState<WindowItem | null>(null), [query, setQuery] = useState(""), [display, setDisplay] = useState(""), [layout, setLayout] = useState("Left half"), [gap, setGap] = useState("12"), [previous, setPrevious] = useState<WindowPlacement | null>(null), [close, setClose] = useState<WindowTarget | null>(null);
  const search = useRef<HTMLInputElement>(null); const action = useNativeAction();
  const refresh = () => void action.run<WindowInventory>("utility_list_windows", {}, (next) => { setData(next); setSelected(null); setDisplay(next.displays.find((item) => item.primary)?.id ?? next.displays[0]?.id ?? ""); return `${next.windows.length} accessible windows found.`; });
  const operate = (target: WindowTarget, operation: string) => void action.run<{ app: string; title: string }>("utility_window_action", { target, action: operation }, (result) => { if (operation === "close") { setData(null); setSelected(null); return "Close requested. Check the app for an unsaved-document prompt, then refresh windows."; } setData((current) => current ? { ...current, windows: current.windows.map((item) => item.target === target ? { ...item, minimized: operation === "minimize", appHidden: false } : item) } : current); return `${result.app}: ${operation === "focus" ? "window focused" : "window minimized"}.`; });
  const displays = data?.displays.map((item) => `${item.name} (${item.id})`) ?? [];
  const selectedDisplay = data?.displays.find((item) => item.id === display);
  const items = data?.windows.filter((item) => `${item.target.app} ${item.target.title}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  return <section className="rk-native-panel" aria-labelledby="windows-title"><h3 id="windows-title">Find and arrange windows</h3><p className="rk-native-description">Find open or minimized windows, bring one forward, or arrange it on a connected display. macOS may request Accessibility and Automation access. Window previews and automatic edge snapping are not enabled.</p>
    <Button disabled={action.busy} onClick={refresh}>Refresh windows</Button>
    {data && <><div className="rk-field"><label htmlFor="native-window-search">Search app or window title</label><div className="rk-inline"><Input id="native-window-search" ref={search} value={query} onChange={(event) => setQuery(event.target.value)} />{query && <Button onClick={() => { setQuery(""); search.current?.focus(); }}>Clear window search</Button>}</div></div>
      <p className="rk-note">{items.length} of {data.windows.length} windows</p>
      {data.warnings.map((warning) => <p className="rk-note" key={warning}>{warning}</p>)}
      <div className="max-h-72 space-y-2 overflow-y-auto">{!items.length && <p className="rk-empty">No matching accessible windows. Try another search or check permissions.</p>}{items.map((item) => <article className="rounded-xl border p-3" key={`${item.target.pid}-${item.target.windowId ?? item.target.index}`}><p className="break-words">{item.target.app} · {item.target.title || "Untitled window"}{item.minimized ? " · Minimized" : ""}{item.appHidden ? " · Hidden app" : ""}</p><div className="rk-actions"><Button disabled={action.busy} onClick={() => operate(item.target, "focus")}>Focus</Button><Button disabled={action.busy || item.minimized} onClick={() => operate(item.target, "minimize")}>Minimize</Button><Button disabled={action.busy} aria-pressed={selected === item} onClick={() => setSelected(item)}>Arrange</Button>{item.canClose && <Button disabled={action.busy} onClick={() => setClose(item.target)}>Close window</Button>}</div></article>)}</div>
      {selected && <div className="mt-4 space-y-3"><p>Arrange: {selected.target.app} · {selected.target.title || "Untitled window"}</p><div className="rk-columns"><div className="rk-field"><label htmlFor="native-window-display">Display</label><utilityUI.Select id="native-window-display" label="Display" value={selectedDisplay ? `${selectedDisplay.name} (${selectedDisplay.id})` : ""} options={displays} onChange={(label) => setDisplay(data.displays[displays.indexOf(label)]?.id ?? "")} /></div><div className="rk-field"><label htmlFor="native-window-layout">Layout</label><utilityUI.Select id="native-window-layout" label="Layout" value={layout} options={Object.keys(windowLayouts)} onChange={setLayout} /></div><div className="rk-field"><label htmlFor="native-window-gap">Gap · 0–64 pixels</label><Input id="native-window-gap" type="number" min={0} max={64} value={gap} onChange={(event) => setGap(event.target.value)} /></div></div>
        <Button disabled={action.busy || !display || !/^\d+$/.test(gap) || Number(gap) > 64} onClick={() => void action.run<WindowPlacement>("utility_place_window", { target: selected.target, layout: windowLayouts[layout as keyof typeof windowLayouts], gap: Number(gap), displayId: display, restore: null }, (placement) => { setPrevious(placement); return `${placement.app} arranged. Some apps enforce a minimum size.`; })}>Apply layout</Button></div>}
    </>}
    {previous && <Button disabled={action.busy} onClick={() => void action.run<WindowPlacement>("utility_place_window", { target: previous.target, layout: "center", gap: 0, displayId: null, restore: previous }, () => { setPrevious(null); return "Previous window placement restored."; })}>Undo last layout</Button>}{action.feedback}
    {close && <NativeConfirmation title={`Close ${close.app} window?`} description={`This sends the normal close action to “${close.title || "Untitled window"}”. The app keeps control of any unsaved-document prompt.`} action="Close window" confirm={() => operate(close, "close")} close={() => setClose(null)} />}
  </section>;
}
