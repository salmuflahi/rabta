import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./kbd";

/** Whole-token class matching — see segmented.test.tsx / row.test.tsx. */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

describe("Kbd", () => {
  it("renders its key text", () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("renders a native <kbd> element", () => {
    render(<Kbd>Esc</Kbd>);
    expect(screen.getByText("Esc").tagName).toBe("KBD");
  });

  it("is presentational, not announced as interactive", () => {
    render(<Kbd>Esc</Kbd>);
    const el = screen.getByText("Esc");
    expect(el).not.toHaveAttribute("role", "button");
    expect(el.getAttribute("tabindex")).toBeNull();
  });

  it("is a 20px pill on --secondary, mono 11px (whole class tokens)", () => {
    render(<Kbd>⌘K</Kbd>);
    const el = screen.getByText("⌘K");
    expect(hasToken(el.className, "h-5")).toBe(true);
    expect(hasToken(el.className, "min-w-5")).toBe(true);
    expect(hasToken(el.className, "bg-secondary")).toBe(true);
    expect(hasToken(el.className, "font-mono")).toBe(true);
    expect(hasToken(el.className, "text-[11px]")).toBe(true);
  });

  it("accepts an additional className", () => {
    render(<Kbd className="ml-1">⌘K</Kbd>);
    expect(hasToken(screen.getByText("⌘K").className, "ml-1")).toBe(true);
  });
});
