import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import App from "./App";

const STORE_DEFAULTS = {
  view: "capsules" as const,
  activeTaskId: null,
  pendingResumeTaskId: null,
  newProjectRequest: false,
  newTaskRequest: false,
  commandOpen: false,
  sidebarCollapsed: false,
};

// A minimal valid project so the first-run onboarding effect (route to
// Overview when list_projects is empty) doesn't fire in shortcut tests that
// assert the view is unchanged.
const FAKE_PROJECT = {
  id: "p1",
  name: "Demo",
  repoPath: "/tmp/demo",
  devUrl: null,
  defaultBranch: "main",
  icon: null,
  archivedAt: null,
  lastOpenedAt: null,
  lastTaskId: null,
  activeSeconds: 0,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("App global keyboard shortcuts", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async () => [] as unknown[]);
    localStorage.clear();
    useStore.setState(STORE_DEFAULTS);
  });

  it("starts one session-tracking lifecycle from the app root", async () => {
    const { unmount } = renderWithProviders(<App />);
    await screen.findByText("Rabta");

    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "session_update")
    ).toHaveLength(1);

    unmount();
  });

  it("⌘⇧N navigates to Capsules and sets newTaskRequest", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true, shiftKey: true });

    expect(useStore.getState().view).toBe("capsules");
    // View was already "capsules", so CapsulesPage doesn't remount here —
    // its consuming effect also guards on a project's new-task input
    // existing, which the default (empty) project list never provides, so
    // the request is left pending rather than cleared. The consume+clear
    // path itself is covered by CapsulesPage.test.tsx.
    expect(useStore.getState().newTaskRequest).toBe(true);
    expect(useStore.getState().newProjectRequest).toBe(false);

    // CapsulesPage's own mount-effect data fetch (list_projects/list_tasks/
    // task_resources/task_pins, all still against the default empty-array
    // mock) settles after these assertions rather than before — flush it
    // within act() so its state updates don't land post-test, same as the
    // ⌘R test above.
    await act(async () => {});
  });

  it("⌘N (no shift) navigates to Projects, opens the register dialog, and clears newProjectRequest", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    expect(useStore.getState().view).toBe("projects");
    // ProjectsPage mounts fresh (view flipped away from "capsules") and its
    // consuming effect fires unconditionally, opening the dialog and
    // clearing the flag right away — mirrors pendingResumeTaskId.
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);
    expect(useStore.getState().newTaskRequest).toBe(false);
  });

  it("⌘R with an active task sets pendingResumeTaskId and navigates to Capsules", async () => {
    // ProjectsPage's mount effect calls `invoke("active_task")` and writes
    // the result into the store's global activeTaskId — mock it to agree
    // with what we preset below, or that async resolution would clobber our
    // "task-42" (with the blanket `[]` default) before ⌘R ever fires.
    mockInvoke.mockImplementation(async (cmd: string) =>
      cmd === "active_task" ? "task-42" : cmd === "list_projects" ? [FAKE_PROJECT] : [],
    );
    useStore.setState({ ...STORE_DEFAULTS, view: "projects", activeTaskId: "task-42" });
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "r", metaKey: true });

    expect(useStore.getState().pendingResumeTaskId).toBe("task-42");
    expect(useStore.getState().view).toBe("capsules");

    await act(async () => {});
  });

  it("⌘R with no active task is a no-op (no pendingResume, no navigation)", async () => {
    mockInvoke.mockImplementation(async (cmd: string) =>
      cmd === "active_task" ? null : cmd === "list_projects" ? [FAKE_PROJECT] : [],
    );
    useStore.setState({ ...STORE_DEFAULTS, view: "projects", activeTaskId: null });
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "r", metaKey: true });

    expect(useStore.getState().pendingResumeTaskId).toBeNull();
    expect(useStore.getState().view).toBe("projects");
  });

  it("routes a first-run user (no projects) to the guided Overview", async () => {
    mockInvoke.mockImplementation(async () => [] as unknown[]); // list_projects -> []
    useStore.setState({ ...STORE_DEFAULTS, view: "capsules" });
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    await waitFor(() => expect(useStore.getState().view).toBe("overview"));
  });

  it("ignores ⌘N/⌘⇧N/⌘R while focus is in a text input, but ⌘K still opens the palette", async () => {
    // Seed a project so first-run onboarding doesn't route to Overview; this
    // test asserts the view is unchanged by the guarded shortcuts.
    mockInvoke.mockImplementation(async (cmd: string) =>
      cmd === "list_projects" ? [FAKE_PROJECT] : [],
    );
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "n", metaKey: true, shiftKey: true });
    fireEvent.keyDown(input, { key: "n", metaKey: true });
    fireEvent.keyDown(input, { key: "r", metaKey: true });

    expect(useStore.getState().newTaskRequest).toBe(false);
    expect(useStore.getState().newProjectRequest).toBe(false);
    expect(useStore.getState().pendingResumeTaskId).toBeNull();
    expect(useStore.getState().view).toBe("capsules");

    await act(async () => {
      fireEvent.keyDown(input, { key: "k", metaKey: true });
    });
    expect(useStore.getState().commandOpen).toBe(true);

    document.body.removeChild(input);
  });

  it("⌘\\ toggles sidebarCollapsed and persists it, even while focus is in a text input", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("true");

    // Like ⌘K, this is a global chrome action, so it fires even while a
    // text field is focused rather than being swallowed by the input guard.
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "\\", metaKey: true });
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("false");
    document.body.removeChild(input);
  });

  it("repeated ⌘N reopens the register dialog every time, even after it was closed in between", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("my-project")).not.toBeInTheDocument();

    // The request flag re-fires (false -> true -> consumed -> false) rather
    // than staying stuck, so a second ⌘N still reopens the dialog.
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);
  });
});

it("no longer pushes the app down when a connector asks to pair", () => {
  useStore.setState({
    pairings: [{ pairingId: "p1", name: "Chrome", kind: "browser" }],
    view: "overview",
  });
  renderWithProviders(<App />);
  // The old banner was a sibling above the shell in the flex column. Nothing
  // may sit between the app root and the shell any more.
  expect(screen.queryByText(/wants to connect to Rabta/)).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("keeps the sheet's accent separate from the page's own accent underneath it", async () => {
  // Task 6 review, Finding 1: the accent rescope's stated motivation — a
  // sheet's accent overlaying a page that already spends its own — was
  // previously proven only against hand-built DOM strings in
  // accent.test.tsx, never against a real render. This renders the real
  // App, with a real page accent underneath a real pending-pairing sheet,
  // and checks the whole document — not RTL's `container` — because
  // Sheet's Radix dialog portals to `document.body` as a *sibling* of
  // `container`, not a descendant of it.
  //
  // Uses the Projects view, not Overview/Capsules: those two turned out to
  // already carry a *second*, pre-existing page-level accent whenever a
  // capsule is open — Toolbar.tsx's `useContextualAction` spends "New
  // capsule" as bg-primary on exactly those two views, at the same time as
  // OverviewPage's hero "Resume" / CapsulesPage's "Restore" or "Capture".
  // That never shows up in OverviewPage.test.tsx / CapsulesPage.test.tsx
  // because both render the page alone, without the real Toolbar — so this
  // App-level test is the first thing in the suite to combine them, and
  // doing so on Overview trips a real *unlayered* two-in-one-group failure
  // unrelated to sheets entirely (flagged separately; not this task's fix
  // to make). Projects doesn't have that problem: with a project already
  // registered (so the page isn't in its own "no projects yet" empty
  // state, which has its own bg-primary CTA), ProjectsPage's detail pane
  // renders no primary button of its own — Toolbar's "Add project" is the
  // view's only accent, cleanly, which is what this test actually needs.
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_projects") return [FAKE_PROJECT];
    return [] as unknown[];
  });
  useStore.setState({ ...STORE_DEFAULTS, view: "projects", pairings: [] });
  renderWithProviders(<App />);

  // Confirm the page's own accent is up *before* the pairing arrives: once
  // the sheet opens, Radix's Dialog marks everything outside its own portal
  // `aria-hidden` (correct, real screen-reader-facing behavior) so a role
  // query for "Add project" would stop finding it — that's a property of
  // `findByRole`'s accessibility-tree filtering, not of whether the button
  // is still on screen. Adding the pairing afterward, through the same
  // `addPairing` action the real hub-event listener calls, mirrors how a
  // request actually arrives: over a page that's already showing its own
  // accent, not started already-overlaid.
  await screen.findByRole("button", { name: "Add project" });
  act(() => {
    useStore.getState().addPairing({ pairingId: "pair-1", name: "Chrome", kind: "browser" });
  });
  await screen.findByRole("dialog");

  // Plain DOM query, unlike the role queries above — unaffected by Radix's
  // aria-hidden on the rest of the tree, so it still sees "Add project".
  expect(() => expectAtMostOneAccent(document.body)).not.toThrow();
});
