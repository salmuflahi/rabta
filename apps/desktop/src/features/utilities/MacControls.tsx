import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwitchMac } from "@/components/ui/switch-mac";
import { utilityUI } from "./ui";
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
type Placement = {
  app: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
const layouts = [
  ["left", "Left half", 0, 0, 46, 60],
  ["right", "Right half", 54, 0, 46, 60],
  ["maximize", "Maximize", 0, 0, 100, 60],
  ["top-left", "Top left", 0, 0, 46, 26],
  ["top-right", "Top right", 54, 0, 46, 26],
  ["center", "Center", 15, 9, 70, 42],
  ["bottom-left", "Bottom left", 0, 34, 46, 26],
  ["bottom-right", "Bottom right", 54, 34, 46, 26],
] as const;
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
    [apps, setApps] = useState<string[]>([]),
    [app, setApp] = useState(""),
    [gap, setGap] = useState("12"),
    [previous, setPrevious] = useState<Placement | null>(null),
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
          Mac controls run in the installed Rabta app. The other tools in this
          workbench work here in your browser.
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
      <section className="rk-native-panel" aria-labelledby="window-title">
        <h3 id="window-title">Window layouts</h3>
        <p className="rk-native-description">
          Arrange an app’s front window on the main display, respecting its menu
          bar and Dock. macOS may ask for Accessibility and Automation access.
        </p>
        <Button
          disabled={!!busy}
          onClick={() =>
            void perform<string[]>(
              "windows",
              "utility_window_apps",
              {},
              (list) => {
                setApps(list);
                if (!list.includes(app)) setApp(list[0] ?? "");
                return list.length
                  ? `${list.length} open apps found.`
                  : "No open apps found.";
              },
            )
          }
        >
          {busy === "windows" ? "Working…" : "Find open apps"}
        </Button>
        {apps.length > 0 && (
          <>
            <div className="rk-field">
              <label htmlFor="window-app">Application</label>
              <utilityUI.Select
                id="window-app"
                label="Application"
                value={app}
                options={apps}
                onChange={setApp}
              />
            </div>
            <div className="rk-field">
              <label htmlFor="window-gap">Gap · 0–64 pixels</label>
              <Input
                id="window-gap"
                type="number"
                min={0}
                max={64}
                value={gap}
                onChange={(e) => setGap(e.target.value)}
              />
            </div>
            <div className="rk-window-choices">
              {layouts.map(([id, name, x, y, w, h]) => (
                <Button
                  key={id}
                  disabled={
                    !!busy ||
                    !app ||
                    !Number.isInteger(Number(gap)) ||
                    Number(gap) < 0 ||
                    Number(gap) > 64
                  }
                  onClick={() =>
                    void perform<Placement>(
                      "windows",
                      "utility_arrange_window",
                      { app, layout: id, gap: Number(gap), restore: null },
                      (placement) => {
                        setPrevious(placement);
                        return `${app}: ${name}. Some apps enforce a minimum window size.`;
                      },
                    )
                  }
                >
                  <svg
                    viewBox="-3 -3 106 66"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <rect width="100" height="60" rx="5" opacity=".3" />
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx="4"
                      fill="currentColor"
                      fillOpacity=".18"
                    />
                  </svg>
                  {name}
                </Button>
              ))}
            </div>
          </>
        )}
        {previous && (
          <div className="rk-actions">
            <Button
              disabled={!!busy}
              onClick={() =>
                void perform<Placement>(
                  "windows",
                  "utility_arrange_window",
                  {
                    app: previous.app,
                    layout: "center",
                    gap: 0,
                    restore: previous,
                  },
                  () => {
                    setPrevious(null);
                    return "Previous placement restored.";
                  },
                )
              }
            >
              Undo last layout
            </Button>
          </div>
        )}
        {result("windows")}
      </section>
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
