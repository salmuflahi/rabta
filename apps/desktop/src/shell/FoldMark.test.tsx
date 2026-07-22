import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { FoldMark } from "./FoldMark";

describe("FoldMark", () => {
  it("renders an svg for state=open", () => {
    const { container } = renderWithProviders(<FoldMark state="open" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders an svg for state=closed", () => {
    const { container } = renderWithProviders(<FoldMark state="closed" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
