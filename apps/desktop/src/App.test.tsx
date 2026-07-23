import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import App from "./App";

const STORE_DEFAULTS = {
  view: "capsules" as const,
  activeTaskId: null,
  pendingResumeTaskId: null,
  newProjectNonce: 0,
  newTaskNonce: 0,
  commandOpen: false,
};

describe("App global keyboard shortcuts", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async () => [] as unknown[]);
    useStore.setState(STORE_DEFAULTS);
  });

  it("⌘⇧N navigates to Capsules and bumps newTaskNonce", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true, shiftKey: true });

    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().newTaskNonce).toBe(1);
    expect(useStore.getState().newProjectNonce).toBe(0);
  });

  it("⌘N (no shift) navigates to Projects and bumps newProjectNonce", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    expect(useStore.getState().view).toBe("projects");
    expect(useStore.getState().newProjectNonce).toBe(1);
    expect(useStore.getState().newTaskNonce).toBe(0);
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

    expect(useStore.getState().newTaskNonce).toBe(0);
    expect(useStore.getState().newProjectNonce).toBe(0);
    expect(useStore.getState().pendingResumeTaskId).toBeNull();
    expect(useStore.getState().view).toBe("capsules");

    fireEvent.keyDown(input, { key: "k", metaKey: true });
    expect(useStore.getState().commandOpen).toBe(true);

    document.body.removeChild(input);
  });

  it("repeated ⌘N re-bumps the nonce even after the initial trigger", async () => {
    renderWithProviders(<App />);
    await screen.findByText("Rabta");

    fireEvent.keyDown(window, { key: "n", metaKey: true });
    fireEvent.keyDown(window, { key: "n", metaKey: true });

    expect(useStore.getState().newProjectNonce).toBe(2);
  });
});
