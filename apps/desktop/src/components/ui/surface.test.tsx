import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { Surface } from "./surface";

// Matches the bare `border` utility AND any hyphenated border-* utility
// (border-b, border-2, border-dashed, border-warning/30, border-border,
// ...) so that a border-width, border-style, or border-colour class slips
// past no more than a bare `border` token would. Anchored on a preceding
// boundary (start of string or whitespace) so it does not fire on
// unrelated classes that merely contain the letters "border" mid-word.
const BORDER_CLASS = /(^|\s)border(-[\w/-]+)?(\s|$)/;

describe("Surface", () => {
  it("defaults to the grouped elevation", () => {
    render(<Surface data-testid="s">rows</Surface>);
    expect(screen.getByTestId("s").className).toMatch(/shadow-grouped/);
  });

  it("uses the raised elevation when asked", () => {
    render(
      <Surface variant="raised" data-testid="s">
        hero
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toMatch(/shadow-raised/);
  });

  // Depth comes from elevation, never from a drawn outline. This is the
  // single rule that separates the new look from the old dashboard one.
  it("draws no border in either variant", () => {
    const { rerender } = render(<Surface data-testid="s">a</Surface>);
    expect(screen.getByTestId("s").className).not.toMatch(BORDER_CLASS);
    rerender(
      <Surface variant="raised" data-testid="s">
        a
      </Surface>,
    );
    expect(screen.getByTestId("s").className).not.toMatch(BORDER_CLASS);
  });

  it("passes through consumer classes", () => {
    render(
      <Surface className="mt-4" data-testid="s">
        a
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toMatch(/mt-4/);
  });

  // Card is re-pointed rather than deleted, so screens not yet migrated
  // improve on their own instead of breaking.
  it("makes Card borderless too", () => {
    render(<Card data-testid="c">legacy</Card>);
    expect(screen.getByTestId("c").className).not.toMatch(BORDER_CLASS);
  });

  // The old Card explicitly coupled its text colour to the card surface
  // rather than letting it inherit ambient --foreground. Restated here so a
  // future divergence between --card-foreground and --foreground would be
  // caught instead of silently changing Card's text colour.
  it("couples Card's text colour to the card surface", () => {
    render(<Card data-testid="c">legacy</Card>);
    expect(screen.getByTestId("c").className).toMatch(/(^|\s)text-card-foreground(\s|$)/);
  });
});
