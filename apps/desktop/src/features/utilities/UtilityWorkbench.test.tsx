import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UtilityWorkbench } from "./shared/UtilityWorkbench";
import { utilityUI } from "./ui";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});
describe("Utility workbench data recovery", () => {
  it("preserves a draft when switching tools and rejects an unsafe link", () => {
    render(<UtilityWorkbench ui={utilityUI} initialTool="clean-links" />);
    fireEvent.change(screen.getByLabelText("Links · one per line"), {
      target: { value: "https://example.com/item?id=42&utm_source=test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculator" }));
    fireEvent.click(screen.getByRole("button", { name: "Clean links" }));
    expect(screen.getByLabelText("Links · one per line")).toHaveValue(
      "https://example.com/item?id=42&utm_source=test",
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Clean links" }).at(-1)!,
    );
    expect(screen.getByText("https://example.com/item?id=42")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Links · one per line"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Clean links" }).at(-1)!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("only HTTP and HTTPS");
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });
  it("flushes a note on pagehide and preserves both copies after a conflict", () => {
    vi.useFakeTimers();
    render(<UtilityWorkbench ui={utilityUI} />);
    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "Local draft" },
    });
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(JSON.parse(localStorage.getItem("rabta.utility.note")!).text).toBe(
      "Local draft",
    );
    act(() => {
      localStorage.setItem(
        "rabta.utility.note",
        JSON.stringify({ text: "Other window", version: "external" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "rabta.utility.note" }),
      );
    });
    expect(screen.getByLabelText("Your note")).toHaveValue("Local draft");
    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "Unsaved local change" },
    });
    act(() => vi.advanceTimersByTime(500));
    expect(JSON.parse(localStorage.getItem("rabta.utility.note")!).text).toBe(
      "Other window",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use saved copy" }));
    expect(screen.getByLabelText("Your note")).toHaveValue("Other window");
  });
  it("does not overwrite unreadable saved snippets", () => {
    localStorage.setItem("rabta.utility.snippets", "damaged");
    render(<UtilityWorkbench ui={utilityUI} initialTool="snippets" />);
    fireEvent.change(screen.getByLabelText("Snippet name"), {
      target: { value: "Draft reply" },
    });
    fireEvent.change(screen.getByLabelText("Snippet text"), {
      target: { value: "Still recoverable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add snippet" }));
    expect(localStorage.getItem("rabta.utility.snippets")).toBe("damaged");
    expect(screen.getByRole("heading", { name: "Draft reply" })).toBeVisible();
  });
  it("refreshes concurrent snippets without losing the open draft", () => {
    render(<UtilityWorkbench ui={utilityUI} initialTool="snippets" />);
    fireEvent.change(screen.getByLabelText("Snippet name"), {
      target: { value: "My reply" },
    });
    fireEvent.change(screen.getByLabelText("Snippet text"), {
      target: { value: "My new text" },
    });
    localStorage.setItem(
      "rabta.utility.snippets",
      JSON.stringify([
        { id: "elsewhere", title: "Other reply", text: "Saved elsewhere" },
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add snippet" }));
    expect(screen.getByLabelText("Snippet text")).toHaveValue("My new text");
    expect(screen.getByRole("heading", { name: "Other reply" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add snippet" }));
    expect(
      JSON.parse(localStorage.getItem("rabta.utility.snippets")!),
    ).toHaveLength(2);
  });
});
