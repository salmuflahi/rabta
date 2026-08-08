import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Section } from "./section";

describe("Section", () => {
  it("labels its group for assistive tech", () => {
    render(
      <Section label="Recent">
        <p>a capsule</p>
      </Section>,
    );
    // The label names the region, so screen-reader users get the same
    // grouping sighted users get from the heading.
    expect(screen.getByRole("region", { name: "Recent" })).toBeInTheDocument();
  });

  it("renders its children", () => {
    render(
      <Section label="Recent">
        <p>a capsule</p>
      </Section>,
    );
    expect(screen.getByText("a capsule")).toBeInTheDocument();
  });

  it("renders a trailing action when given one", () => {
    render(
      <Section label="Recent" action={<button type="button">All capsules</button>}>
        <p>a capsule</p>
      </Section>,
    );
    expect(screen.getByRole("button", { name: "All capsules" })).toBeInTheDocument();
  });

  // Grouping comes from a label plus spacing. A box around it would put
  // the dashboard look straight back.
  it("draws no border or background of its own", () => {
    const { container } = render(
      <Section label="Recent">
        <p>a</p>
      </Section>,
    );
    const region = container.querySelector("section")!;
    expect(region.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(region.className).not.toMatch(/bg-/);
  });
});
