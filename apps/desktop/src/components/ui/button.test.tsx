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
