import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./stepper";

/** Whole-token class matching — see segmented.test.tsx / row.test.tsx. */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

describe("Stepper", () => {
  it("displays the current value in tabular mono (whole class tokens)", () => {
    render(<Stepper value={7} onChange={() => {}} label="Hub port" />);
    const value = screen.getByText("7");
    expect(hasToken(value.className, "font-mono")).toBe(true);
    expect(hasToken(value.className, "tabular-nums")).toBe(true);
  });

  it("increments the value when the up button is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={7} onChange={onChange} label="Hub port" />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Hub port" }));
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it("decrements the value when the down button is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={7} onChange={onChange} label="Hub port" />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Hub port" }));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("steps by the given `step`, not always 1", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} label="Zoom" step={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Zoom" }));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("does not call onChange past max, and announces the boundary", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} label="Hub port" max={10} />);
    const up = screen.getByRole("button", { name: /Increase Hub port/ });
    fireEvent.click(up);
    expect(onChange).not.toHaveBeenCalled();
    expect(up).toHaveAccessibleName(expect.stringContaining("maximum"));
    expect(up).toHaveAttribute("aria-disabled", "true");
  });

  it("does not call onChange past min, and announces the boundary", () => {
    const onChange = vi.fn();
    render(<Stepper value={0} onChange={onChange} label="Hub port" min={0} />);
    const down = screen.getByRole("button", { name: /Decrease Hub port/ });
    fireEvent.click(down);
    expect(onChange).not.toHaveBeenCalled();
    expect(down).toHaveAccessibleName(expect.stringContaining("minimum"));
    expect(down).toHaveAttribute("aria-disabled", "true");
  });

  it("clamps an increment that would overshoot max", () => {
    const onChange = vi.fn();
    render(<Stepper value={8} onChange={onChange} label="Hub port" max={10} step={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Hub port" }));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("the up/down buttons are real, enabled, tab-reachable buttons even at a boundary", () => {
    // Native <button> Enter/Space activation is not something happy-dom
    // promotes from a keydown event (no HTMLButtonElement keydown-activation
    // implementation — see switch-mac.test.tsx's precedent), so keyboard
    // operability for these buttons is proven by asserting the real
    // element/contract rather than firing a keydown and expecting a state
    // flip. A boundary button stays reachable (never native `disabled`) so
    // assistive tech can still land on it and read why it's inert, per the
    // brief: "a disabled control must still be able to explain why."
    render(<Stepper value={10} onChange={() => {}} label="Hub port" max={10} min={0} />);
    const up = screen.getByRole("button", { name: /Increase Hub port/ });
    const down = screen.getByRole("button", { name: /Decrease Hub port/ });
    for (const btn of [up, down]) {
      expect(btn.tagName).toBe("BUTTON");
      expect(btn).not.toBeDisabled();
      expect(btn.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("performs the click contract that native keyboard activation fires", () => {
    function Controlled() {
      const [value, setValue] = useState(5);
      return <Stepper value={value} onChange={setValue} label="Hub port" />;
    }
    render(<Controlled />);
    const up = screen.getByRole("button", { name: "Increase Hub port" });
    up.focus();
    fireEvent.click(up);
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("sizes the up/down buttons 17x11 sharing a hairline (whole class tokens)", () => {
    render(<Stepper value={5} onChange={() => {}} label="Hub port" />);
    const up = screen.getByRole("button", { name: "Increase Hub port" });
    const down = screen.getByRole("button", { name: "Decrease Hub port" });
    for (const btn of [up, down]) {
      expect(hasToken(btn.className, "w-[17px]")).toBe(true);
      expect(hasToken(btn.className, "h-[11px]")).toBe(true);
    }
    // The shared divider lives on the top (increase) button's bottom edge.
    expect(hasToken(up.className, "border-b-[0.5px]")).toBe(true);
  });

  it("never shows a pointer cursor — macOS controls use cursor: default", () => {
    render(<Stepper value={5} onChange={() => {}} label="Hub port" />);
    for (const btn of screen.getAllByRole("button")) {
      expect(hasToken(btn.className, "cursor-default")).toBe(true);
    }
  });
});
