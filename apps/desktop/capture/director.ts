export type ScreenName =
  | "overview"
  | "capsules"
  | "projects"
  | "connectors"
  | "activity"
  | "settings"
  | "restore";
export type DemoName = "hero-return" | "honest-return";

export type CaptureMode =
  | { kind: "screen"; name: ScreenName }
  | { kind: "demo"; name: DemoName };

export const DEMO_TIMELINES = {
  "hero-return": {
    durationMs: 8000,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-active-task" },
      { atMs: 500, action: "save-state" },
      { atMs: 2000, action: "leave-task" },
      { atMs: 4000, action: "resume-task" },
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
  const demo = /(?:^|[#&])demo=(hero-return|honest-return)/.exec(hash)?.[1] as
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
