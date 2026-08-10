/**
 * Capture-only boot. Must be the FIRST import in `main.tsx`.
 *
 * Both of the things this does have to happen before the app's own modules
 * are evaluated, and ES imports are hoisted — so doing them in `main.tsx`'s
 * body, as this used to, runs them *after* `import App from "@/App"` has
 * already pulled in `src/store.ts` and executed its top-level
 * `const INITIAL_PREFS = readPrefs()`.
 *
 * The symptom was subtle enough to survive a long time: the seeded
 * preferences took effect on the *next* page load, not this one, and the
 * capture rig never noticed because it wrote the same values every run, so
 * the stale read and the fresh write agreed. It shows up the moment a
 * value actually varies — `#theme=light` rendered dark until you reloaded
 * twice.
 *
 * Nothing here is part of the shipped app.
 */
import { parsePose } from "./director";
import { NOW_MS } from "./seed";

// ---------------------------------------------------------------- clock
//
// Pinned before anything can capture it, so every relative label
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
// what gets captured is the app configured normally. Defaults are what the
// screenshot driver has always produced — dark, tangerine, sidebar
// expanded, developer console off. `parsePose` only moves them when a
// hand-posed URL asks; see capture/README.md.
export const POSE = parsePose(window.location.hash);

try {
  localStorage.clear();
  localStorage.setItem(
    "rabta.prefs",
    JSON.stringify({
      theme: POSE.theme,
      accent: POSE.accent,
      motion: "system",
      rememberSidebar: true,
      landingPage: "overview",
      resumeOnLaunch: false,
      keepCompleted: true,
      developerMode: false,
    }),
  );
  localStorage.setItem("rabta.sidebarCollapsed", String(POSE.sidebarCollapsed));
} catch {
  /* ignore */
}
