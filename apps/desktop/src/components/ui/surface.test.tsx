import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(screen.getByTestId("s").className).not.toMatch(/(^|\s)border(\s|$)/);
    rerender(
      <Surface variant="raised" data-testid="s">
        a
      </Surface>,
    );
    expect(screen.getByTestId("s").className).not.toMatch(/(^|\s)border(\s|$)/);
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
    expect(screen.getByTestId("c").className).not.toMatch(/(^|\s)border(\s|$)/);
  });
});
