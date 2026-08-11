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
});
