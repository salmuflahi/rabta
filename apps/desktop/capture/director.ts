export type ScreenName =
  | "overview"
  | "capsules"
  | "projects"
  | "connectors"
  | "activity"
  | "settings"
  | "restore";
export type DemoName = "hero-return" | "honest-return" | "capture" | "leave" | "return";

export type CaptureMode =
  | { kind: "screen"; name: ScreenName }
  | { kind: "demo"; name: DemoName };

/** What a demo recording shows. `app` is the whole window; `sheet` hides
 *  everything but the restore dialog so the recorder can capture it as an
 *  alpha layer the loops composite over the app at their own depth. */
export type CaptureRegion = "app" | "sheet";

export type DemoAction =
  | "show-active-task"
  | "show-capsule"
  | "save-state"
  | "leave-task"
  | "resume-task";

export interface DemoCue {
  readonly atMs: number;
  readonly action: DemoAction;
}

export const DEMO_TIMELINES = {
  // The hero is cut as three shots by marketing-videos/site-demos: a 3s
  // tilted shot on the capsule (the click lands at 1000ms, where the camera's
  // 700ms push arrives), a flat shot whose whip pan hides the Overview
  // switch, and the restore sheet. The leave and resume cues sit where those
  // shots need them; move one and re-cut the loop.
  "hero-return": {
    durationMs: 8000,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-active-task" },
      { atMs: 1000, action: "save-state" },
      { atMs: 3000, action: "leave-task" },
      { atMs: 4300, action: "resume-task" },
    ],
  },
  "honest-return": {
    durationMs: 5000,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-capsule" },
      { atMs: 700, action: "resume-task" },
    ],
  },
  // The three moves, one clean beat each, for the site's product loops.
  capture: {
    durationMs: 4000,
    finalLabel: "Capsule saved",
    cues: [
      { atMs: 0, action: "show-capsule" },
      // 1000, not 900: the loop's push-in starts at 300ms and takes 700ms,
      // and it must land on the frame the button is pressed.
      { atMs: 1000, action: "save-state" },
    ],
  },
  leave: {
    durationMs: 4000,
    finalLabel: "Another task is active",
    cues: [
      { atMs: 0, action: "show-capsule" },
      { atMs: 900, action: "leave-task" },
    ],
  },
  return: {
    durationMs: 5500,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-capsule" },
      { atMs: 900, action: "resume-task" },
    ],
  },
} as const;

const SCREENS: ScreenName[] = [
  "overview",
  "capsules",
  "projects",
  "connectors",
  "activity",
  "settings",
  "restore",
];

export function parseCaptureMode(hash: string): CaptureMode {
  const demo = /(?:^|[#&])demo=(hero-return|honest-return|capture|leave|return)/.exec(hash)?.[1] as
    | DemoName
    | undefined;

  if (demo) return { kind: "demo", name: demo };

  const requested = /(?:^|[#&])capture=([a-z]+)/.exec(hash)?.[1] as
    | ScreenName
    | undefined;

  return {
    kind: "screen",
    name: requested && SCREENS.includes(requested) ? requested : "overview",
  };
}

export function parseCaptureRegion(hash: string): CaptureRegion {
  return /(?:^|[#&])region=sheet(?:&|$)/.test(hash) ? "sheet" : "app";
}

// ---------------------------------------------------------------- posing
//
// Extra hash switches for hand-taken promotional shots. The screenshot
// driver never sets these — it wants one deterministic look — but a person
// posing a shot wants to choose the theme, the accent, whether the sidebar
// is in the picture, and whether the palette is open. Keeping them here,
// beside `parseCaptureMode`, means the capture entry point stays a parser
// plus a director rather than growing its own regex pile.

export type PoseTheme = "light" | "dark";

export interface Pose {
  theme: PoseTheme;
  /** One of `ACCENTS` (src/theme/accent.ts). Unvalidated here — the store's
   *  own `readPrefs` falls back to tangerine for anything unrecognised, so
   *  a typo poses the default rather than breaking the render. */
  accent: string;
  sidebarCollapsed: boolean;
  /** Open the ⌘K palette over whichever screen was requested. */
  palette: boolean;
}

/** Reads the posing switches out of the URL hash.
 *
 * Defaults match what the screenshot driver has always produced — dark,
 * tangerine, sidebar expanded, no palette — so `#capture=overview` on its
 * own is byte-identical to before these existed. */
export function parsePose(hash: string): Pose {
  const theme = /(?:^|[&#])theme=(light|dark)/.exec(hash)?.[1] as PoseTheme | undefined;
  const accent = /(?:^|[&#])accent=([a-z]+)/.exec(hash)?.[1];
  return {
    theme: theme ?? "dark",
    accent: accent ?? "tangerine",
    sidebarCollapsed: /(?:^|[&#])sidebar=collapsed(?:&|$)/.test(hash),
    palette: /(?:^|[&#])palette(?:=1|=true)?(?:&|$)/.test(hash),
  };
}
