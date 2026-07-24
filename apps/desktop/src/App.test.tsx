import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("App global keyboard shortcuts", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async () => [] as unknown[]);
    localStorage.clear();
    useStore.setState(STORE_DEFAULTS);
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
    mockInvoke.mockImplementation(async (cmd: string) => (cmd === "active_task" ? "task-42" : []));
    useStore.setState({ ...STORE_DEFAULTS, view: "projects", activeTaskId: "task-42" });
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "r", metaKey: true });

    expect(useStore.getState().pendingResumeTaskId).toBe("task-42");
    expect(useStore.getState().view).toBe("capsules");
  });

  it("⌘R with no active task is a no-op (no pendingResume, no navigation)", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => (cmd === "active_task" ? null : []));
    useStore.setState({ ...STORE_DEFAULTS, view: "projects", activeTaskId: null });
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "r", metaKey: true });

    expect(useStore.getState().pendingResumeTaskId).toBeNull();
    expect(useStore.getState().view).toBe("projects");
  });

  it("ignores ⌘N/⌘⇧N/⌘R while focus is in a text input, but ⌘K still opens the palette", async () => {
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

    fireEvent.keyDown(input, { key: "k", metaKey: true });
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
