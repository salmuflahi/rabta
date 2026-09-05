import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./segmented";

/**
 * Splits a class string into individual utility tokens. Whole-token
 * matching, not substring matching — see src/test/no-box.ts and
 * src/components/ui/row.test.tsx for the established rationale: a
 * substring match on "shadow-raised" would also accept an unrelated class
 * that merely contains those characters where the exact utility is what the
 * design system contract actually requires.
 */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

// NOTE: driven via fireEvent, not `@testing-library/user-event` — the
// latter is not a dependency of this package (see GitLine.test.tsx for the
// precedent). Segmented's click/keydown handlers are plain synthetic
// DOM events, which happy-dom dispatches the same way real browsers do.

const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

describe("Segmented", () => {
  it("exposes a radiogroup with the given accessible name", () => {
    render(
      <Segmented value="light" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });

  it("marks exactly one option selected via aria-checked, never colour alone", () => {
    render(
      <Segmented value="light" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Light");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(
      <Segmented value="light" onChange={onChange} options={options} ariaLabel="Theme" />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("moves selection to the next option on ArrowRight, wrapping at the end", () => {
    const onChange = vi.fn();
    render(
      <Segmented value="dark" onChange={onChange} options={options} ariaLabel="Theme" />,
    );
    const dark = screen.getByRole("radio", { name: "Dark" });
    dark.focus();
    fireEvent.keyDown(dark, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("system");
  });

  it("moves selection to the previous option on ArrowLeft, wrapping at the start", () => {
    const onChange = vi.fn();
    render(
      <Segmented value="system" onChange={onChange} options={options} ariaLabel="Theme" />,
    );
    const system = screen.getByRole("radio", { name: "System" });
    system.focus();
    fireEvent.keyDown(system, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("moves keyboard focus onto the newly selected option", () => {
    function Controlled() {
      const [value, setValue] = useState("light");
      return (
        <Segmented value={value} onChange={setValue} options={options} ariaLabel="Theme" />
      );
    }
    render(<Controlled />);
    const light = screen.getByRole("radio", { name: "Light" });
    light.focus();
    fireEvent.keyDown(light, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveFocus();
  });

  it("only the selected option is in tab order — a roving tabindex", () => {
    render(
      <Segmented value="light" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    const radios = screen.getAllByRole("radio");
    const tabIndexes = radios.map((r) => r.getAttribute("tabindex"));
    expect(tabIndexes.filter((t) => t === "0")).toHaveLength(1);
    expect(tabIndexes.filter((t) => t === "-1")).toHaveLength(2);
  });

  it("uses a 2px-padded track on --secondary with 7px radius (whole class tokens)", () => {
    render(
      <Segmented value="light" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    const group = screen.getByRole("radiogroup");
    expect(hasToken(group.className, "bg-secondary")).toBe(true);
    expect(hasToken(group.className, "p-0.5")).toBe(true);
    expect(hasToken(group.className, "rounded-[7px]")).toBe(true);
  });

  it("gives the selected segment weight 510 and slides one raised surface under it (whole class tokens)", () => {
    const { container } = render(
      <Segmented value="dark" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    const selected = screen.getByRole("radio", { name: "Dark" });
    const unselected = screen.getByRole("radio", { name: "Light" });
    expect(hasToken(selected.className, "font-510")).toBe(true);
    expect(hasToken(unselected.className, "font-510")).toBe(false);
    // The raised surface is one element that travels, not a style on each
    // segment, so switching reads as the surface moving.
    const thumb = container.querySelector("[data-segmented-thumb]") as HTMLElement;
    expect(thumb).not.toBeNull();
    expect(thumb.getAttribute("aria-hidden")).toBe("true");
    expect(hasToken(thumb.className, "shadow-raised")).toBe(true);
    expect(hasToken(thumb.className, "bg-card")).toBe(true);
    expect(hasToken(selected.className, "shadow-raised")).toBe(false);
    expect(hasToken(unselected.className, "font-510")).toBe(false);
  });

  it("never shows a pointer cursor — macOS controls use cursor: default", () => {
    render(
      <Segmented value="light" onChange={() => {}} options={options} ariaLabel="Theme" />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(hasToken(radio.className, "cursor-default")).toBe(true);
    }
  });
});
