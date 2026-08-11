// apps/desktop/src/lib/useListNavigation.test.tsx
import { fireEvent, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { useListNavigation } from "./useListNavigation";
import { renderWithProviders } from "@/test/smoke-utils";

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

function Harness({ onSelect = vi.fn(), selectedId = "a" as string | null }) {
  const nav = useListNavigation({
    items: ITEMS,
    idOf: (i) => i.id,
    labelOf: (i) => i.label,
    selectedId,
    onSelect,
    idPrefix: "test",
  });
  return (
    <div {...nav.containerProps} aria-label="Test list">
      {ITEMS.map((item, index) => (
        <div key={item.id} {...nav.getItemProps(item, index)}>
          {item.label}
        </div>
      ))}
    </div>
  );
}

// Two rows share a first letter so repeated same-letter type-ahead presses
// have somewhere to cycle to.
const CYCLE_ITEMS = [
  { id: "x", label: "Cherry" },
  { id: "y", label: "Coconut" },
  { id: "z", label: "Fig" },
];

// Harness holds selectedId itself (wiring onSelect back into state), unlike
// the plain Harness above whose selectedId prop is static. Cycling through
// repeated-letter matches only shows up across renders where selectedId has
// actually moved on from the previous keystroke.
function StatefulHarness({ initialSelectedId = null as string | null }) {
  const [selectedId, setSelectedId] = React.useState(initialSelectedId);
  const nav = useListNavigation({
    items: CYCLE_ITEMS,
    idOf: (i) => i.id,
    labelOf: (i) => i.label,
    selectedId,
    onSelect: setSelectedId,
    idPrefix: "cycle",
  });
  return (
    <div {...nav.containerProps} aria-label="Cycle list">
      {CYCLE_ITEMS.map((item, index) => (
        <div key={item.id} {...nav.getItemProps(item, index)}>
          {item.label}
        </div>
      ))}
    </div>
  );
}

describe("useListNavigation", () => {
  it("marks the container a listbox and rows options", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByRole("listbox", { name: "Test list" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks only the selected row aria-selected", () => {
    renderWithProviders(<Harness selectedId="b" />);
    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
  });

  // Roving tabindex: one stop for the whole list, arrows move within it.
  it("puts exactly one row in the tab order", () => {
    renderWithProviders(<Harness selectedId="b" />);
    const tabbable = screen.getAllByRole("option").filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveTextContent("Bravo");
  });

  it("selects the next row on ArrowDown", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("selects the previous row on ArrowUp", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="b" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("stops at the ends rather than wrapping", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("jumps with Home and End", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="b" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
    expect(onSelect).toHaveBeenCalledWith("c");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Home" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("jumps to a row by typing its first letter", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "c" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  // Regression for a double-fire found in review: selectAndFocus calls
  // onSelect(id) directly, then el.focus() — which synchronously dispatches
  // focus/focusin (confirmed against happy-dom's HTMLElementUtility.focus(),
  // which dispatches unconditionally), which React delegates to this row's
  // own onFocus, which must not re-invoke onSelect for a move that already
  // reported itself.
  it("calls onSelect exactly once per keyboard move", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("tolerates an empty list", () => {
    function Empty() {
      const nav = useListNavigation({
        items: [],
        idOf: (i: { id: string }) => i.id,
        labelOf: () => "",
        selectedId: null,
        onSelect: vi.fn(),
        idPrefix: "empty",
      });
      return <div {...nav.containerProps} aria-label="Empty" />;
    }
    renderWithProviders(<Empty />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  // The brief's central click-vs-keyboard distinction, pinned from both
  // sides: a click reports the new selection without moving focus (the user
  // may have clicked with focus deliberately elsewhere, e.g. a filter input
  // above the list); a keyboard move does move focus, onto the row it just
  // selected.
  it("does not move focus on click, leaving focus wherever it already was", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <div>
        <input aria-label="Elsewhere" />
        <Harness onSelect={onSelect} selectedId="a" />
      </div>
    );
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    fireEvent.click(screen.getByRole("option", { name: "Bravo" }));

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("focuses the newly selected row after a keyboard move", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Bravo" }));
  });

  it("cycles through same-letter matches on repeated type-ahead presses", () => {
    renderWithProviders(<StatefulHarness />);
    const listbox = screen.getByRole("listbox");

    fireEvent.keyDown(listbox, { key: "c" });
    expect(screen.getByRole("option", { name: "Cherry" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(listbox, { key: "c" });
    expect(screen.getByRole("option", { name: "Coconut" })).toHaveAttribute("aria-selected", "true");

    // Only two of the three rows start with "c" — the third press cycles
    // back around to the first match rather than getting stuck or stalling.
    fireEvent.keyDown(listbox, { key: "c" });
    expect(screen.getByRole("option", { name: "Cherry" })).toHaveAttribute("aria-selected", "true");
  });

  it("treats a selectedId naming no current item as nothing selected", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="not-a-real-id" />);

    // Falls back to row 0 for the roving tab stop rather than stranding the
    // list with zero tabbable rows.
    const tabbable = screen.getAllByRole("option").filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveTextContent("Alpha");

    // No row claims the stale id, so aria-activedescendant has nothing
    // truthful to point at.
    expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-activedescendant");

    // Nothing validly selected reads as "before row 0": ArrowDown reveals
    // the top row.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("does not handle Enter or Space", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Enter" });
    fireEvent.keyDown(listbox, { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
