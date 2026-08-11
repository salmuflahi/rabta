import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, NAV_KEYS, readPrefs, useStore, writePrefs, type NavKey } from "@/store";
import { HISTORY_LIMIT } from "./shell/history";

describe("connector store carries reported version", () => {
  beforeEach(() => {
    useStore.setState({ connectors: [], log: [] });
  });

  it("setConnectors keeps the version a live connector reported", () => {
    useStore.getState().setConnectors([
      { id: "c1", name: "VS Code", kind: "vscode", capabilities: ["files"], version: "0.3.0" },
      { id: "c2", name: "Legacy", kind: "fake", capabilities: [] },
    ]);
    const rows = useStore.getState().connectors;
    expect(rows.find((r) => r.id === "c1")?.version).toBe("0.3.0");
    expect(rows.find((r) => r.id === "c2")?.version).toBeUndefined();
  });

  it("preload seeds a known connector's last-reported version onto its row", () => {
    useStore.getState().preload(
      [],
      [
        {
          name: "Chrome",
          kind: "chrome",
          capabilities: ["tabs"],
          version: "1.2.3",
          firstSeen: "2026-01-01T00:00:00.000Z",
          lastSeen: "2026-01-02T00:00:00.000Z",
        },
      ]
    );
    const row = useStore.getState().connectors.find((r) => r.name === "Chrome");
    expect(row?.version).toBe("1.2.3");
    expect(row?.connected).toBe(false);
  });
});

// Task 8: the status bar's visibility is driven by `prefs.statusbar`. Task 2
// shipped `readPrefs` spreading an unvalidated `JSON.parse` result over
// `DEFAULT_PREFS` — a corrupt persisted `accent` crashed the app on first
// render until that key got its own validation. `statusbar` is a plain
// boolean, so the equivalent corruption is a persisted non-boolean
// ("true", null, 0, "yes") silently making the bar render or hide
// unpredictably instead of falling back to the default.
describe("readPrefs with corrupt persisted statusbar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when the persisted value is the string \"true\"", () => {
    localStorage.setItem("rabta.prefs", JSON.stringify({ statusbar: "true" }));
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(DEFAULT_PREFS.statusbar);
  });

  it("returns the default when the persisted value is null", () => {
    localStorage.setItem("rabta.prefs", JSON.stringify({ statusbar: null }));
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(DEFAULT_PREFS.statusbar);
  });

  it("returns the default when the persisted value is a number", () => {
    localStorage.setItem("rabta.prefs", JSON.stringify({ statusbar: 0 }));
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(DEFAULT_PREFS.statusbar);
  });

  it("returns the default when the persisted JSON is corrupt", () => {
    localStorage.setItem("rabta.prefs", "{ corrupt json");
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(DEFAULT_PREFS.statusbar);
  });

  it("preserves other valid preferences when statusbar is corrupt", () => {
    localStorage.setItem(
      "rabta.prefs",
      JSON.stringify({ statusbar: "nope", theme: "dark", developerMode: true })
    );
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(DEFAULT_PREFS.statusbar);
    expect(prefs.theme).toBe("dark");
    expect(prefs.developerMode).toBe(true);
  });

  it("still round-trips a valid statusbar value (false) correctly", () => {
    writePrefs({ ...DEFAULT_PREFS, statusbar: false });
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(false);
  });

  it("still round-trips a valid statusbar value (true) correctly", () => {
    writePrefs({ ...DEFAULT_PREFS, statusbar: false });
    writePrefs({ ...DEFAULT_PREFS, statusbar: true });
    const prefs = readPrefs();
    expect(prefs.statusbar).toBe(true);
  });
});

// `landingPage` was the last preference `readPrefs` trusted straight out of
// `JSON.parse`, and the only one that is also a *view*: it seeds `view` and
// `history[0].view`, so a bad value does not fail loudly — `App.tsx`'s switch
// falls through to its `never` branch and React renders the raw string as a
// text node where the page should be.
//
// It was reachable without hand-editing localStorage: `MigrateSheet` writes an
// imported bundle's preferences string into `rabta.prefs` verbatim, so the
// value can arrive from another machine's app — or from a bundle file. That is
// what makes this a boundary rather than a curiosity.
describe("readPrefs with a persisted landingPage outside NavKey", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when the view no longer exists", () => {
    // The realistic case: a preference written by a build where the view was
    // called something else, read back by one where it isn't.
    localStorage.setItem("rabta.prefs", JSON.stringify({ landingPage: "tasks" }));
    expect(readPrefs().landingPage).toBe(DEFAULT_PREFS.landingPage);
  });

  it("returns the default when the persisted value is not a string at all", () => {
    localStorage.setItem("rabta.prefs", JSON.stringify({ landingPage: { view: "capsules" } }));
    expect(readPrefs().landingPage).toBe(DEFAULT_PREFS.landingPage);
  });

  it("returns the default when the persisted value is null", () => {
    localStorage.setItem("rabta.prefs", JSON.stringify({ landingPage: null }));
    expect(readPrefs().landingPage).toBe(DEFAULT_PREFS.landingPage);
  });

  it("does not accept a JavaScript prototype property as a view", () => {
    // `includes` on the array is doing the checking, not `in` on an object —
    // this is the assertion that would catch a future refactor to a lookup
    // object, where "toString" and "constructor" both pass an `in` check.
    localStorage.setItem("rabta.prefs", JSON.stringify({ landingPage: "toString" }));
    expect(readPrefs().landingPage).toBe(DEFAULT_PREFS.landingPage);
  });

  it("preserves other valid preferences when landingPage is corrupt", () => {
    localStorage.setItem(
      "rabta.prefs",
      JSON.stringify({ landingPage: "nope", theme: "dark", accent: "petrol" })
    );
    const prefs = readPrefs();
    expect(prefs.landingPage).toBe(DEFAULT_PREFS.landingPage);
    expect(prefs.theme).toBe("dark");
    expect(prefs.accent).toBe("petrol");
  });

  it("round-trips every real view untouched", () => {
    // The check has to accept all six, not merely reject a bad one — a
    // validator that quietly forced everyone onto the default would pass a
    // rejection-only test.
    for (const view of NAV_KEYS) {
      writePrefs({ ...DEFAULT_PREFS, landingPage: view });
      expect(readPrefs().landingPage).toBe(view);
    }
  });
});

describe("connector reconnect doesn't strand a duplicate offline row", () => {
  beforeEach(() => {
    useStore.setState({ connectors: [], log: [] });
  });

  it("a reconnect under a fresh id supersedes the previous session's row", () => {
    useStore.getState().setConnectors([
      { id: "sess-1", name: "VS Code", kind: "vscode", capabilities: ["files"] },
    ]);
    // The hub mints a new id per accept, so a restart/blip returns the same
    // tool under a different id.
    useStore.getState().setConnectors([
      { id: "sess-2", name: "VS Code", kind: "vscode", capabilities: ["files"] },
    ]);
    const vscode = useStore
      .getState()
      .connectors.filter((r) => r.name === "VS Code" && r.kind === "vscode");
    expect(vscode).toHaveLength(1);
    expect(vscode[0].id).toBe("sess-2");
    expect(vscode[0].connected).toBe(true);
  });

  it("a genuinely gone connector stays as a single offline row", () => {
    useStore.getState().setConnectors([
      { id: "sess-1", name: "VS Code", kind: "vscode", capabilities: [] },
    ]);
    useStore.getState().setConnectors([]);
    const vscode = useStore.getState().connectors.filter((r) => r.name === "VS Code");
    expect(vscode).toHaveLength(1);
    expect(vscode[0].connected).toBe(false);
  });
});

describe("navigation history", () => {
  beforeEach(() => {
    useStore.setState({
      view: "overview",
      history: [{ view: "overview", selection: null }],
      historyIndex: 0,
      selectedCapsuleId: null,
      selectedProjectId: null,
    });
  });

  it("records a view change", () => {
    useStore.getState().setView("capsules");
    const s = useStore.getState();
    expect(s.history).toHaveLength(2);
    expect(s.historyIndex).toBe(1);
  });

  it("goes back to the previous view", () => {
    useStore.getState().setView("capsules");
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().historyIndex).toBe(0);
  });

  // The invariant: moving through history must not itself write history.
  it("does not record the act of going back", () => {
    useStore.getState().setView("capsules");
    const before = useStore.getState().history.length;
    useStore.getState().goBack();
    expect(useStore.getState().history).toHaveLength(before);
  });

  it("restores the selection that was live in the view being returned to", () => {
    useStore.getState().setView("capsules");
    useStore.getState().selectCapsule("task-7");
    useStore.getState().setView("projects");
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().selectedCapsuleId).toBe("task-7");
  });

  // The real call sites (ProjectsPage's "open this capsule", OverviewPage's
  // "Also open", every cross-list row in CommandPalette) select *before*
  // navigating — selectCapsule(id) fires while still on the origin view,
  // then setView("capsules") follows. That's the opposite order from the
  // test above (select-after-arriving). If a select* action records under
  // the live view instead of the view its id belongs to, this order
  // rewrites the origin view's own history entry with the wrong-view
  // selection instead of pushing a new one for the destination — silently
  // corrupting the entry Back is supposed to return to.
  it("keeps the origin view's own selection when selecting precedes navigating away (select-then-navigate order)", () => {
    useStore.getState().setView("projects");
    useStore.getState().selectProject("proj-1");
    // Still on "projects" here — exactly like ProjectsPage's capsule-row
    // onClick, which calls selectCapsule before setView("capsules").
    useStore.getState().selectCapsule("task-9");
    useStore.getState().setView("capsules");
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("projects");
    expect(useStore.getState().selectedProjectId).toBe("proj-1");
  });

  it("goes forward again after going back", () => {
    useStore.getState().setView("capsules");
    useStore.getState().goBack();
    useStore.getState().goForward();
    expect(useStore.getState().view).toBe("capsules");
  });

  it("ignores goBack at the start and goForward at the end", () => {
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().historyIndex).toBe(0);
    useStore.getState().goForward();
    expect(useStore.getState().historyIndex).toBe(0);
  });

  it("never grows past the cap", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      useStore.getState().setView(i % 2 ? "capsules" : "projects");
    }
    expect(useStore.getState().history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  // `NavKey` is a closed union, but `applyLocation`'s exhaustiveness switch
  // only guards that at compile time (`never`) — a runtime value outside the
  // union flows straight through. `readPrefs` now validates `landingPage`
  // against NAV_KEYS (see the describe below), which closes the route that
  // was known to reach here. This test keeps the belt: it seeds a corrupt
  // entry directly, so the fail-safe is still proven independently of
  // whichever upstream path might produce one.
  it("goBack into a corrupt history entry does not scatter it across the store", () => {
    useStore.setState({
      view: "capsules",
      history: [
        { view: "not-a-real-view" as NavKey, selection: null },
        { view: "capsules", selection: null },
      ],
      historyIndex: 1,
      selectedCapsuleId: "task-1",
    });

    useStore.getState().goBack();

    const s = useStore.getState() as unknown as Record<string, unknown>;
    // The bug this guards against: applyLocation's default branch returning
    // the raw `never`-typed string, which goBack then spreads into the
    // store patch (`{...applyLocation(loc), historyIndex}`). Spreading a
    // string scatters its characters as numeric-indexed keys —
    // "not-a-real-view" would leave a literal `s["0"] === "n"` sitting on
    // the store.
    expect(s["0"]).toBeUndefined();
    expect(s["1"]).toBeUndefined();
    expect(Object.keys(s).some((k) => /^\d+$/.test(k))).toBe(false);
    // Fail-safe degradation: the index still moves past the corrupt entry
    // (so a second goBack isn't stuck retrying it), but view/selection are
    // left exactly as they were rather than corrupted.
    expect(useStore.getState().historyIndex).toBe(0);
    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().selectedCapsuleId).toBe("task-1");
  });
});
