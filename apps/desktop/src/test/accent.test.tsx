import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { expectAtMostOneAccent } from "./accent";

describe("expectAtMostOneAccent", () => {
  it("passes when a view has no accent", () => {
    const { container } = render(<Button>Cancel</Button>);
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("passes when a view has exactly one accent", () => {
    const { container } = render(
      <>
        <Button variant="primary">Resume</Button>
        <Button>Cancel</Button>
      </>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("fails and names the offenders when a view has two", () => {
    const { container } = render(
      <>
        <Button variant="primary">Resume</Button>
        <Button variant="primary">Approve</Button>
      </>,
    );
    expect(() => expectAtMostOneAccent(container)).toThrow(/Resume.*Approve/s);
  });

  it("passes when a live marker with data-accent-mark is alongside one primary action button", () => {
    const { container } = render(
      <div>
        <div className="bg-primary" data-accent-mark>
          Active
        </div>
        <Button variant="primary">Resume</Button>
      </div>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("passes when two live markers alongside one primary action button", () => {
    const { container } = render(
      <div>
        <div className="bg-primary" data-accent-mark>
          Active
        </div>
        <div className="bg-primary" data-accent-mark>
          Running
        </div>
        <Button variant="primary">Resume</Button>
      </div>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("passes when a live marker alone carries bg-primary", () => {
    const { container } = render(
      <div className="bg-primary" data-accent-mark>
        Active
      </div>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("counts SVG elements carrying bg-primary", () => {
    const { container } = render(
      <div>
        <svg className="bg-primary" data-testid="svg-accent">
          <circle cx="50" cy="50" r="40" />
        </svg>
      </div>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });
});

it("budgets a modal layer separately from the page beneath it", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <main><button class="bg-primary">Page accent</button></main>
    <div data-sheet><button class="bg-primary">Sheet accent</button></div>
  `;
  expect(() => expectAtMostOneAccent(container)).not.toThrow();
});

it("still rejects two accents inside one layer", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <main><button class="bg-primary">One</button><button class="bg-primary">Two</button></main>
  `;
  expect(() => expectAtMostOneAccent(container)).toThrow();
});
