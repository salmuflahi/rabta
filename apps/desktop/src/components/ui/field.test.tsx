import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";

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

describe("Field", () => {
  it("associates its label with the control", () => {
    render(
      <Field label="Focus mode" htmlFor="focus">
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(screen.getByLabelText("Focus mode")).toBeInTheDocument();
  });

  // A destructive-feeling setting has to explain its guarantee at the point
  // of decision, not in a doc nobody opens.
  it("renders a description when given one", () => {
    render(
      <Field
        label="Focus mode"
        description="Puts away what the task does not want. Busy terminals are never closed."
        htmlFor="focus"
      >
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(
      screen.getByText(/Busy terminals are never closed/),
    ).toBeInTheDocument();
  });

  it("omits the description element entirely when there is none", () => {
    const { container } = render(
      <Field label="Focus mode" htmlFor="focus">
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(container.querySelector("[data-field-description]")).toBeNull();
  });

  it("suppresses the top border on the first stacked Field", () => {
    const { container } = render(
      <div>
        <Field label="First field" htmlFor="first">
          <input id="first" type="checkbox" />
        </Field>
        <Field label="Second field" htmlFor="second">
          <input id="second" type="checkbox" />
        </Field>
      </div>,
    );

    const fieldElements = container.querySelectorAll("[data-field]");
    expect(fieldElements).toHaveLength(2);

    const firstField = fieldElements[0];
    const secondField = fieldElements[1];

    // First Field: carries the first:border-t-0 token
    expect(hasToken(firstField.className, "first:border-t-0")).toBe(true);
    // First Field: carries the standalone border-t token (not defeated by substring match)
    expect(hasToken(firstField.className, "border-t")).toBe(true);
    // First Field: carries the hairline colour token
    expect(hasToken(firstField.className, "border-border/60")).toBe(true);
    // First Field: must NOT carry the full four-sided border token (the "box regression")
    expect(lacksBaseUtility(firstField.className, "border")).toBe(true);

    // Second Field: carries the top border
    expect(hasToken(secondField.className, "border-t")).toBe(true);
    // Second Field: carries the hairline colour token
    expect(hasToken(secondField.className, "border-border/60")).toBe(true);
    // Second Field: must NOT carry the full four-sided border token
    expect(lacksBaseUtility(secondField.className, "border")).toBe(true);
  });
});
