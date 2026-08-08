import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoBorder } from "@/test/no-box";
import { Card } from "./card";
import { Surface } from "./surface";

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
    expectNoBorder(screen.getByTestId("s"));
    rerender(
      <Surface variant="raised" data-testid="s">
        a
      </Surface>,
    );
    expectNoBorder(screen.getByTestId("s"));
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
    expectNoBorder(screen.getByTestId("c"));
  });

  // Card uses grouped elevation (the default), not raised. Raised is reserved
  // for the single hero surface per screen; grouping six Cards as raised
  // competing heroes is wrong. This pins the contract so Card naturally
  // degrades when screens migrate to Surface.
  it("renders Card with grouped elevation, not raised", () => {
    render(<Card data-testid="c">legacy</Card>);
    expect(screen.getByTestId("c").className).toMatch(/shadow-grouped/);
    expect(screen.getByTestId("c").className).not.toMatch(/shadow-raised/);
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
