import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { ProjectsPage } from "./ProjectsPage";

describe("ProjectsPage", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
  });

  it("renders without throwing (catches missing-provider crashes)", async () => {
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("Projects")).toBeInTheDocument();
  });

  it("newProjectRequest opens the register dialog once and clears itself", async () => {
    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    act(() => useStore.getState().requestNewProject());

    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    // The flag resets right after firing (mirrors pendingResumeTaskId) — it
    // isn't left set like the old counter would have been.
    expect(useStore.getState().newProjectRequest).toBe(false);
  });

  it("remounting after a consumed request does not reopen the dialog; a fresh ⌘N does", async () => {
    // Simulates App.tsx's CurrentPage switch unmounting/remounting this page
    // when the sidebar navigates away and back — the historical bug: with a
    // never-reset counter, every remount after the first ⌘N would spuriously
    // reopen the dialog.
    const first = renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);

    first.unmount();
    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    // Remount with the flag already false: no spurious reopen.
    expect(screen.queryByPlaceholderText("my-project")).not.toBeInTheDocument();

    // A second ⌘N (requestNewProject) still reopens it post-remount.
    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);
  });
});
