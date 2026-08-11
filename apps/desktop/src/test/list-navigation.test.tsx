// apps/desktop/src/test/list-navigation.test.tsx
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
// smoke-utils (and its `vi.mock("@tauri-apps/api/core", ...)`) MUST be
// imported before any page — see a11y-guard.test.tsx's own note on this.
// CapsulesPage/ProjectsPage import `invoke` from "@tauri-apps/api/core" at
// module scope, and Vitest links that specifier to whichever module — real
// or mocked — is first in the import graph. Confirmed the hard way while
// writing this file: with the pages imported first, both crashed on mount
// ("Cannot read properties of undefined (reading 'invoke')", the real
// module reaching for a Tauri bridge that doesn't exist in happy-dom) and
// silently rendered their LoadError panel — no listbox, every assertion
// failing on "Unable to find role=listbox" instead of on anything about
// keyboard navigation.
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { ActivityPage } from "@/pages/ActivityPage";
import { CapsulesPage } from "@/pages/CapsulesPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";
import { ProjectsPage } from "@/pages/ProjectsPage";

// One suite, four pages: the whole reason these share a hook is that a user
// who learns the keyboard on one list has learned it on all of them.
const PAGES = [
  { name: "Capsules", Page: CapsulesPage },
  { name: "Projects", Page: ProjectsPage },
  { name: "Connectors", Page: ConnectorsPage },
  { name: "Activity", Page: ActivityPage },
];

// Two projects (Projects needs >1 row of its own to prove ArrowDown moves
// anywhere), three capsules all under the first (Capsules only needs >1 row
// too — cross-group index continuity is Capsules' own concern, covered in
// CapsulesPage.test.tsx, not this shared suite).
const PROJECT_A = {
  id: "proj-a",
  name: "Alpha Project",
  repoPath: "/tmp/alpha",
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
const PROJECT_B = { ...PROJECT_A, id: "proj-b", name: "Bravo Project", sortOrder: 1 };

const TASKS = ["Alpha capsule", "Bravo capsule", "Charlie capsule"].map((title, i) => ({
  id: `task-${i}`,
  projectId: PROJECT_A.id,
  title,
  status: "open" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

const CONNECTORS = [
  { id: "conn-1", name: "VS Code", kind: "vscode", capabilities: [], connected: true, connectedSince: "2026-01-01T00:00:00.000Z" },
  { id: "conn-2", name: "Chrome", kind: "chrome", capabilities: [], connected: false, connectedSince: "2026-01-01T00:00:00.000Z" },
  { id: "conn-3", name: "Cursor", kind: "cursor", capabilities: [], connected: true, connectedSince: "2026-01-01T00:00:00.000Z" },
];

const LOG = [
  { seq: 1, at: "2026-01-01T00:00:00.000Z", type: "commandSent", connectorId: "conn-1", name: "workspace.state" },
  { seq: 2, at: "2026-01-01T00:00:01.000Z", type: "responseReceived", connectorId: "conn-1", name: "workspace.state" },
  { seq: 3, at: "2026-01-01T00:00:02.000Z", type: "commandSent", connectorId: "conn-2", name: "tabs.list" },
];

const CLEAN_STATUS = { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 };

// Capsules and Projects fetch their rows through Tauri `invoke`; Connectors
// and Activity read theirs straight off the store (App.tsx's preload effect
// is what fills that store outside a test). Both data sources are seeded
// here, unconditionally, so any of the four pages finds real, multi-row
// content regardless of which one a given `it` mounts — mockInvoke is the
// smoke-utils re-export (never `@tauri-apps/api/core` directly), which is
// what guarantees every page's `invoke` call resolves to this mock
// regardless of import order.
beforeEach(() => {
  useStore.setState({
    // Explicit, not null: three of these four pages fall back to their
    // *first* row when nothing is selected, so `null` would incidentally
    // land ArrowDown-has-somewhere-to-go for them anyway — but ActivityPage
    // deliberately falls back to its *newest* (last) event instead (it
    // auto-follows the newest event; see ActivityPage.tsx), so `null` there
    // starts the suite already on the last row, where ArrowDown is
    // correctly a no-op ("ends do not wrap") and every page-uniform
    // assertion below about moving forward would fail on Activity alone —
    // not a bug, just the wrong starting condition for what this suite is
    // testing. Pinning every page to its first row's id makes the
    // precondition the same across all four regardless of that difference.
    selectedCapsuleId: TASKS[0].id,
    selectedProjectId: PROJECT_A.id,
    selectedConnectorId: CONNECTORS[0].id,
    selectedEventSeq: LOG[0].seq,
    activeTaskId: null,
    capsuleFilter: "open",
    pendingResumeTaskId: null,
    newTaskRequest: false,
    newProjectRequest: false,
    paused: false,
    projects: [],
    connectors: CONNECTORS,
    log: LOG,
    pairings: [],
    connectorsAndLogLoaded: true,
  });
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_projects":
        return [PROJECT_A, PROJECT_B];
      case "list_tasks":
        return TASKS.filter((t) => t.projectId === a?.projectId);
      case "task_resources":
      case "task_pins":
        return [];
      case "active_task":
        return null;
      case "git_status":
        return CLEAN_STATUS;
      default:
        return [];
    }
  });
});

describe.each(PAGES)("$name master list", ({ Page }) => {
  it("is a listbox", async () => {
    renderWithProviders(<Page />);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("puts exactly one row in the tab order", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options.filter((el) => el.tabIndex === 0)).toHaveLength(1);
  });

  it("moves the selection with ArrowDown", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const before = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const after = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    expect(after).toBe(before + 1);
  });

  // Beyond the brief's own three assertions: aria-selected/tabIndex
  // bookkeeping being correct is not proof that real DOM focus actually
  // moved — a hook could update both on every row while never calling
  // `el.focus()`, and none of the three tests above would catch it, since
  // none of them look at document.activeElement. This one does, against
  // real pages, not a scratch harness. (This is also what would have caught
  // the forwardRef bug documented in row.tsx, from when these four lists
  // briefly spread getItemProps' ref onto `Row` — see task-11-report.md's
  // addendum for why that wiring was reverted. The rows are native
  // `<button>`s again now, which accept a plain `ref` directly and don't
  // need forwardRef at all, so that specific bug can't recur here — but the
  // test still earns its keep as a general real-focus regression guard,
  // independent of which bug originally prompted writing it.)
  it("moves real DOM focus onto the newly selected row on ArrowDown", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const before = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const options = within(list).getAllByRole("option");
    expect(document.activeElement).toBe(options[before + 1]);
  });

  // The brief's central click-vs-keyboard split (see useListNavigation's own
  // doc comment), pinned against a real page rather than only the hook's
  // isolated Harness: a click reports the new selection without moving
  // focus off wherever it already was.
  it("does not steal focus on click", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    const focusedBeforeClick = document.activeElement;
    fireEvent.click(options[options.length - 1]);
    expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(focusedBeforeClick);
  });

  // Reviewer note: Home/End, ArrowUp, type-ahead and "ends don't wrap" were,
  // until now, proven only once, generically, against
  // useListNavigation.test.tsx's synthetic Harness — parity across the four
  // real pages was an inference from uniform wiring, not an executed proof.
  // The three tests below close that gap for the behaviours cheap enough to
  // prove without page-specific setup.

  // Combines End, Home, and both directions of "ends do not wrap" in one
  // test (rather than four) because each successive assertion's setup is
  // free — reaching an end via End/Home is exactly the precondition the
  // matching no-wrap assertion needs, so there's nothing to gain by paying
  // for a fresh render per behaviour.
  it("jumps to the ends with Home/End, and does not wrap past them", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const lastIndex = within(list).getAllByRole("option").length - 1;
    const selectedIndex = () =>
      within(list)
        .getAllByRole("option")
        .findIndex((el) => el.getAttribute("aria-selected") === "true");

    fireEvent.keyDown(list, { key: "End" });
    expect(selectedIndex()).toBe(lastIndex);

    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(selectedIndex()).toBe(lastIndex); // no wrap forward, past the last row

    fireEvent.keyDown(list, { key: "Home" });
    expect(selectedIndex()).toBe(0);

    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(selectedIndex()).toBe(0); // no wrap backward, past the first row
  });

  // ArrowDown-moves-forward is already covered above; this is specifically
  // ArrowUp's own decrement, which needs a starting point off the first row
  // (the beforeEach seed starts every page there) — moved forward once via
  // ArrowDown purely as setup, then the one ArrowUp under test brings it
  // back, which is only true if ArrowUp genuinely moved rather than no-op'd.
  it("moves the selection with ArrowUp", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    const selected = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    expect(selected).toBe(0);
  });

  // Reads whatever the row right after the current selection actually
  // renders — never a hardcoded string — so this proves type-ahead
  // uniformly across all four pages despite their very different label
  // shapes (a capsule/project/connector name vs. Activity's humanized event
  // sentence) without needing page-specific fixtures. This is guaranteed to
  // land on `target`, not some other row: handleTypeahead in
  // useListNavigation.ts always checks currentIndex+1 first, and a row's
  // own label always starts with its own first character, so the very row
  // this test reads the letter from is the first (and matching) candidate
  // it checks, regardless of what any other row's label starts with.
  it("jumps to the next row by typing its first letter", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const target = within(list).getAllByRole("option")[1];
    const firstLetter = target.textContent!.trim().charAt(0).toLowerCase();

    fireEvent.keyDown(list, { key: firstLetter });

    expect(target).toHaveAttribute("aria-selected", "true");
  });
});
