import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Resume</Button>);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-destructive");
  });
  it("supports asChild (renders as anchor)", () => {
    render(<Button asChild><a href="#x">Link</a></Button>);
    expect(screen.getByRole("link", { name: "Link" })).toBeInTheDocument();
  });
});

describe("button accent discipline", () => {
  // Orange must be opted into. A Button written without a variant is the
  // most common Button in the codebase, so the default decides how much
  // orange the app has.
  it("does not paint the accent when no variant is given", () => {
    render(<Button>Save state</Button>);
    expect(screen.getByRole("button").className).not.toMatch(/bg-primary/);
  });

  it("paints the accent only for the primary variant", () => {
    render(<Button variant="primary">Resume</Button>);
    expect(screen.getByRole("button").className).toMatch(/bg-primary/);
  });

  it("keeps destructive separate from the accent", () => {
    render(<Button variant="destructive">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/bg-destructive/);
    expect(cls).not.toMatch(/bg-primary/);
  });
});
