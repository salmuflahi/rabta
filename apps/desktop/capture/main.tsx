/**
 * Capture-only entry point.
 *
 * Renders the real <App/> inside the real providers, against the mocked
 * bridge in `mock-tauri.ts`. Nothing here is part of the shipped app.
 *
 * The screen to capture comes from the URL hash: `#capture=capsules`.
 * Each screen settles into a static end state so a screenshot taken after
 * Chrome's virtual-time budget elapses is reproducible.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore, type NavKey } from "@/store";
import { NOW_MS } from "./seed";
import "@/index.css";

// ---------------------------------------------------------------- clock
//
// Pin time before anything imports it, so every relative label
// ("8m ago", "1h 30m ago") is identical on every run.
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date>) {
    // `new Date()` with no arguments yields the pinned instant; every other
    // form behaves normally so parsing seed timestamps still works.
    super(...(args.length === 0 ? [NOW_MS] : args));
  }
  static now() {
    return NOW_MS;
  }
}
globalThis.Date = FrozenDate as DateConstructor;

// ------------------------------------------------------------ preferences
//
// Seed the app's own preference store rather than overriding its CSS, so
// the captured UI is the app configured normally — dark theme, sidebar
// expanded, developer console off.
try {
  localStorage.clear();
  localStorage.setItem(
    "rabta.prefs",
    JSON.stringify({
      theme: "dark",
      motion: "system",
      rememberSidebar: true,
      landingPage: "overview",
      resumeOnLaunch: false,
      keepCompleted: true,
      developerMode: false,
    }),
  );
  localStorage.setItem("rabta.sidebarCollapsed", "false");
} catch {
  /* ignore */
}

// --------------------------------------------------------------- screens

type Screen = NavKey | "restore";

const VALID: Screen[] = [
  "overview",
  "capsules",
  "projects",
  "connectors",
  "activity",
  "settings",
  "restore",
];

function requestedScreen(): Screen {
  const m = /(?:^|[#&])capture=([a-z]+)/.exec(window.location.hash);
  const value = m?.[1] as Screen | undefined;
  return value && VALID.includes(value) ? value : "overview";
}

const screen = requestedScreen();

/** Drives the app into the requested state after the tree mounts, using the
 *  store's own public actions — the same ones the sidebar and command
 *  palette use. No component internals are reached into. */
function Director() {
  React.useEffect(() => {
    const { setView, requestResume } = useStore.getState();

    if (screen === "restore") {
      // The Restore Experience is owned by CapsulesPage, which watches
      // `pendingResumeTaskId` and drives the real restore ceremony — the
      // identical path the Resume button takes.
      setView("capsules");
      requestResume("task_reconnect");
      return;
    }

    setView(screen);
  }, []);

  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  // No StrictMode: its intentional double-effect would fire the restore
  // request twice and make the captured state depend on render timing.
  <ThemeProvider>
    <TooltipProvider delayDuration={200}>
      <Director />
      <App />
    </TooltipProvider>
  </ThemeProvider>,
);

// Mark the document once the first paint has happened, so the driver can
// assert the app actually rendered rather than capturing a blank frame.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.setAttribute("data-capture", screen);
  });
});
