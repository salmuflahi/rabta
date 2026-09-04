/**
 * Capture-only entry point.
 *
 * Renders the real <App/> inside the real providers, against the mocked
 * bridge in `mock-tauri.ts`. Nothing here is part of the shipped app.
 *
 * The requested mode comes from the URL hash: `#capture=capsules` for a
 * static screen, or `#demo=hero-return` for a directed real-product loop.
 */
// MUST be first: seeds the frozen clock and the posed preferences before
// any app module (and therefore `src/store.ts`'s top-level readPrefs) is
// evaluated. See capture/boot.ts.
import { POSE } from "./boot";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import { IconSprite } from "@/components/ui/icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useStore } from "@/store";
import { DEMO_TIMELINES, parseCaptureMode, parseCaptureRegion } from "./director";
import type { DemoAction } from "./director";
import "@/index.css";

// --------------------------------------------------------------- direction

const mode = parseCaptureMode(window.location.hash);
const mobileDemo = /(?:^|[#&])variant=mobile(?:&|$)/.test(window.location.hash);

if (mode.kind === "demo") {
  document.documentElement.dataset.demo = mode.name;
  document.documentElement.dataset.demoVariant = mobileDemo ? "mobile" : "desktop";
  // `region=sheet` makes index.html hide everything but the restore dialog,
  // so the recorder can capture the sheet alone as an alpha layer.
  document.documentElement.dataset.demoRegion = parseCaptureRegion(window.location.hash);
  // The contract, readable by the recorder, so its cue sidecar is written
  // from the same numbers that drive the page rather than a copy of them.
  (window as unknown as { __rabtaDemo: unknown }).__rabtaDemo = {
    name: mode.name,
    ...DEMO_TIMELINES[mode.name],
  };
}

/** The capsule's real save control. Its label is "Capture" (it was "Save
 *  State" before the rebrand and the director's cue still says so); either
 *  spelling is accepted so a rename in the app fails loudly here instead of
 *  silently recording a demo in which nothing was pressed. */
function clickRealSaveState(): void {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    /^(Capture|Save State)$/.test(candidate.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  if (!button) throw new Error("capture: the real Capture (Save State) control was not rendered");
  button.click();
}

/** Drives the app into the requested state after the tree mounts, using the
 *  store's own public actions — the same ones the sidebar and command
 *  palette use. No component internals are reached into. */
function Director() {
  React.useEffect(() => {
    const { setView, requestResume, setActiveTaskId, setCommandOpen } = useStore.getState();

    // Posed last in every branch below would mean repeating it; the palette
    // sits over whatever screen was requested, so it can be opened first.
    if (POSE.palette) setCommandOpen(true);

    if (mode.kind === "screen" && mode.name === "restore") {
      // The Restore Experience is owned by CapsulesPage, which watches
      // `pendingResumeTaskId` and drives the real restore ceremony — the
      // identical path the Resume button takes.
      setView("capsules");
      requestResume("task_reconnect");
      return;
    }

    if (mode.kind === "screen") {
      setView(mode.name);
      return;
    }

    const timeline = DEMO_TIMELINES[mode.name];
    const timers: number[] = [];
    let started = false;

    const later = (delayMs: number, action: () => void) => {
      timers.push(window.setTimeout(action, delayMs));
    };

    const start = () => {
      if (started) return;
      started = true;
      document.documentElement.dataset.demoStarted = "true";

      // Every demo is its DEMO_TIMELINES entry, played: the cue times there
      // are the only copy, so the recorder's sidecar, the director test and
      // the footage cannot drift apart.
      const perform: Record<DemoAction, () => void> = {
        "show-active-task": () => setView("capsules"),
        "show-capsule": () => setView("capsules"),
        "save-state": clickRealSaveState,
        "leave-task": () => {
          setView("overview");
          // Overview confirms the backend's current task on mount. Let that
          // real load settle, then direct the public store to the other-task
          // cut required by the storyboard.
          later(50, () => setActiveTaskId("task_focus"));
        },
        "resume-task": () => {
          setView("capsules");
          requestResume("task_reconnect");
        },
      };
      for (const cue of timeline.cues) {
        if (cue.atMs === 0) perform[cue.action]();
        else later(cue.atMs, perform[cue.action]);
      }

      later(timeline.durationMs, () => {
        document.documentElement.dataset.demoComplete = "true";
      });
    };

    const onStart = () => start();
    document.addEventListener("rabta-demo-start", onStart, { once: true });
    document.documentElement.dataset.demoReady = "true";

    // The recorder dispatches the start event immediately after the OS video
    // process is live. This fallback keeps direct/manual demo URLs useful.
    later(3000, start);

    return () => {
      document.removeEventListener("rabta-demo-start", onStart);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  // No StrictMode: its intentional double-effect would fire the restore
  // request twice and make the captured state depend on render timing.
  <>
    {/* Mounted once, at the app root, exactly as src/main.tsx does — every
        <Icon>'s <use href="#ic-…"> resolves against these defs. Without it,
        every sprite-based icon (search, plus, chevrons, the sidebar's nav
        icons, toggle and shield line) silently renders nothing, and no
        screenshot review has any way to know unless someone looks. */}
    <IconSprite />
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <Director />
        <App />
        {/* Mounted exactly as src/main.tsx mounts it, so the app's real
            reaction to Capture — the "Saved state" toast — is in the footage.
            Without it the click was invisible: nothing on screen changed. */}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </>,
);

// Mark the document once the first paint has happened, so the driver can
// assert the app actually rendered rather than capturing a blank frame.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (mode.kind === "screen") {
      document.documentElement.setAttribute("data-capture", mode.name);
    }
  });
});
