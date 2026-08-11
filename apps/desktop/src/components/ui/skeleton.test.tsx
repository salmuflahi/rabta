import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";
import { renderWithProviders } from "@/test/smoke-utils";

describe("Skeleton", () => {
  it("sweeps rather than pulsing", () => {
    renderWithProviders(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.className).toContain("animate-skeleton-sweep");
    expect(el.className).not.toContain("animate-pulse");
  });

  // A skeleton is decoration standing in for content that is not there —
  // a screen reader should skip it, not announce a run of blank boxes.
  it("is hidden from assistive technology", () => {
    renderWithProviders(<Skeleton data-testid="s" />);
    expect(screen.getByTestId("s")).toHaveAttribute("aria-hidden", "true");
  });
});
