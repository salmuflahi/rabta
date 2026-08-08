import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "./surface";
import { Row } from "./row";

/**
 * Splits a class string into individual utility tokens.
 */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

/**
 * Strips Tailwind variant prefixes (e.g., hover:, dark:, first:) off a token.
 */
function baseUtilityOf(token: string): string {
  const parts = token.split(":");
  return parts[parts.length - 1];
}

/**
 * Returns true if the exact token (as a whole class) is present.
 */
function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

/**
 * Returns true if a token with the given base utility is present.
 * e.g., hasBaseUtility(className, "border-t") matches "border-t" or "first:border-t-0"
 */
function hasBaseUtility(className: string, baseUtil: string): boolean {
  return classTokensOf(className).some((token) => baseUtilityOf(token) === baseUtil);
}

/**
 * Returns true if NO token matches the given base utility.
 */
function lacksBaseUtility(className: string, baseUtil: string): boolean {
  return !hasBaseUtility(className, baseUtil);
}

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

    // First row: suppresses the hairline with first:border-t-0
    expect(rows[0].className).toMatch(/first:border-t-0/);
    // First row: carries the standalone border-t token (not defeated by first:border-t-0 substring)
    expect(hasToken(rows[0].className, "border-t")).toBe(true);
    // First row: carries the hairline colour token
    expect(hasToken(rows[0].className, "border-border/60")).toBe(true);
    // First row: must NOT carry the full four-sided border token (the "box regression")
    expect(lacksBaseUtility(rows[0].className, "border")).toBe(true);

    // Second row: carries the top border
    expect(hasToken(rows[1].className, "border-t")).toBe(true);
    // Second row: carries the hairline colour token
    expect(hasToken(rows[1].className, "border-border/60")).toBe(true);
    // Second row: must NOT carry the full four-sided border token
    expect(lacksBaseUtility(rows[1].className, "border")).toBe(true);
  });

  it("omits the subtitle element entirely when there is none", () => {
    const { container } = render(
      <Surface>
        <Row title="one" />
      </Surface>,
    );
    expect(container.querySelector("[data-row-subtitle]")).toBeNull();
  });

  // `title` is typed as ReactNode (not the native HTML tooltip string) so
  // callers can pass JSX — icons, spans, formatted fragments — not just text.
  it("accepts a JSX title", () => {
    render(
      <Surface>
        <Row title={<span data-testid="jsx-title">hello</span>} />
      </Surface>,
    );
    expect(screen.getByTestId("jsx-title")).toBeInTheDocument();
  });
});
