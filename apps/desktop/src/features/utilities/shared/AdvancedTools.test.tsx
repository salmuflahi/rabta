import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UtilityWorkbench } from "./UtilityWorkbench";
import { utilityUI } from "../ui";

beforeEach(() => localStorage.clear());
describe("Mode discovery and local work", () => {
  it("restores a mode without hiding tools from other professions", () => {
    localStorage.setItem("rabta.utility.mode", "Developer");
    render(<UtilityWorkbench ui={utilityUI} initialTool="diff" />);
    expect(
      screen.getByRole("combobox", { name: "Your mode" }),
    ).toHaveTextContent("Developer");
    expect(screen.getByText("Developer picks")).toBeVisible();
    expect(screen.getByRole("button", { name: "Study cards" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Content planner" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Before"), {
      target: { value: "A draft" },
    });
    fireEvent.change(screen.getByLabelText("Find a utility"), {
      target: { value: "student" },
    });
    expect(screen.getByRole("button", { name: "Study cards" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Study cards" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Clear utility search" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Text diff" }));
    expect(screen.getByLabelText("Before")).toHaveValue("A draft");
  });
  it("keeps a planner draft when saved content changes in another window", () => {
    render(<UtilityWorkbench ui={utilityUI} initialTool="planner" />);
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "My new post" },
    });
    const other = [
      {
        id: "other",
        title: "Other post",
        channel: "Social",
        caption: "Other caption",
        wallTime: "2026-09-15 14:30",
        timezone: "UTC",
        instant: "2026-09-15T14:30:00.000Z",
      },
    ];
    act(() => {
      localStorage.setItem(
        "rabta.utility.content-plan.v1",
        JSON.stringify(other),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "rabta.utility.content-plan.v1" }),
      );
    });
    expect(
      screen.getByRole("button", { name: "Save draft on device" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved plan" }));
    expect(screen.getByLabelText("Post title")).toHaveValue("My new post");
    expect(screen.getByRole("heading", { name: "Other post" })).toBeVisible();
  });
  it("keeps an open draft recoverable when opening a different saved post", () => {
    localStorage.setItem(
      "rabta.utility.content-plan.v1",
      JSON.stringify([
        {
          id: "other",
          title: "Saved launch",
          channel: "Social",
          caption: "Saved caption",
          wallTime: "2026-09-15 14:30",
          timezone: "UTC",
          instant: "2026-09-15T14:30:00.000Z",
        },
      ]),
    );
    render(<UtilityWorkbench ui={utilityUI} initialTool="planner" />);
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Unfinished draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Saved launch" }));
    expect(screen.getByLabelText("Post title")).toHaveValue("Unfinished draft");
    fireEvent.click(screen.getByRole("button", { name: "Open saved draft" }));
    expect(screen.getByLabelText("Post title")).toHaveValue("Saved launch");
    fireEvent.click(
      screen.getByRole("button", { name: "Restore previous draft" }),
    );
    expect(screen.getByLabelText("Post title")).toHaveValue("Unfinished draft");
  });
  it("preserves damaged plan data and still allows draft export", () => {
    localStorage.setItem("rabta.utility.content-plan.v1", "damaged");
    render(<UtilityWorkbench ui={utilityUI} initialTool="planner" />);
    expect(screen.getByRole("alert")).toHaveTextContent("unreadable");
    expect(
      screen.getByRole("button", { name: "Save draft on device" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Export draft text" }),
    ).toBeEnabled();
    expect(localStorage.getItem("rabta.utility.content-plan.v1")).toBe(
      "damaged",
    );
  });
  it("reports cancelled native exports without claiming a saved reminder", async () => {
    const exportFile = vi.fn().mockResolvedValue({ cancelled: true });
    render(
      <UtilityWorkbench
        ui={{ ...utilityUI, exportFile }}
        initialTool="planner"
      />,
    );
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Launch" },
    });
    fireEvent.change(
      screen.getByLabelText("Scheduled date · YYYY-MM-DD HH:mm"),
      { target: { value: "2026-09-15 14:30" } },
    );
    fireEvent.change(screen.getByLabelText("Schedule timezone"), {
      target: { value: "UTC" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Export draft reminder" }),
    );
    expect(
      await screen.findByText("Export cancelled. Your work is still here."),
    ).toBeVisible();
    expect(exportFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/File exported/)).toBeNull();
    expect(screen.getByLabelText("Post title")).toHaveValue("Launch");
  });
  it("builds study cards and reveals the exact source answer", () => {
    render(<UtilityWorkbench ui={utilityUI} initialTool="study" />);
    fireEvent.change(screen.getByLabelText("Your study notes"), {
      target: {
        value:
          "Cell: The basic unit of life.\nAtom: The basic unit of an element.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build study cards" }));
    const card = screen.getByRole("article", { name: "Card 1 of 2" });
    expect(within(card).getByRole("heading")).toHaveTextContent(
      "Explain: Cell",
    );
    expect(within(card).queryByText("The basic unit of life.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(within(card).getByText("The basic unit of life.")).toBeVisible();
    expect(
      within(card).getByText("Cell: The basic unit of life."),
    ).toBeInTheDocument();
  });
});
