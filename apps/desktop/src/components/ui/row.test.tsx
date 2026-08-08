import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "./surface";
import { Row } from "./row";

describe("Row", () => {
  it("renders title, subtitle, leading and trailing content", () => {
    render(
      <Surface>
        <Row
          leading={<span data-testid="lead" />}
          title="Ship the settings redesign"
          subtitle="mercury-web · 3h 30m"
          trailing={<button type="button">Resume</button>}
        />
      </Surface>,
    );
    expect(screen.getByText("Ship the settings redesign")).toBeInTheDocument();
    expect(screen.getByText("mercury-web · 3h 30m")).toBeInTheDocument();
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  // Separation between siblings, never a box around each one — and never a
  // stray line above the first row inside its surface.
  it("suppresses its hairline on the first row", () => {
    const { container } = render(
      <Surface>
        <Row title="one" />
        <Row title="two" />
      </Surface>,
    );
    const rows = container.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toMatch(/first:border-t-0/);
    expect(rows[0].className).toMatch(/border-t/);
    expect(rows[1].className).toMatch(/border-t/);
  });

  it("omits the subtitle element entirely when there is none", () => {
    const { container } = render(
      <Surface>
        <Row title="one" />
      </Surface>,
    );
    expect(container.querySelector("[data-row-subtitle]")).toBeNull();
  });
});
