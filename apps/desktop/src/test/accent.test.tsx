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
});
