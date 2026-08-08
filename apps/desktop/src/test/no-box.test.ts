import { describe, expect, it } from "vitest";
import { expectNoBackground, expectNoBorder } from "./no-box";

function elWithClass(className: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("class", className);
  return el;
}

function svgWithClass(className: string): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("class", className);
  return el;
}

describe("expectNoBorder", () => {
  it("rejects the bare border utility", () => {
    expect(() => expectNoBorder(elWithClass("border"))).toThrow(/border/);
  });

  it("rejects border-b", () => {
    expect(() => expectNoBorder(elWithClass("mb-5 border-b"))).toThrow(/border-b/);
  });

  it("rejects border-2", () => {
    expect(() => expectNoBorder(elWithClass("border-2"))).toThrow(/border-2/);
  });

  it("rejects border-border/60", () => {
    expect(() => expectNoBorder(elWithClass("rounded-md border-border/60"))).toThrow(
      /border-border\/60/,
    );
  });

  it("rejects a variant-prefixed border utility", () => {
    expect(() => expectNoBorder(elWithClass("hover:border-b"))).toThrow(/hover:border-b/);
  });

  it("does not reject a class that merely contains the letters 'border' as part of another word", () => {
    expect(() => expectNoBorder(elWithClass("bordered reborder-x"))).not.toThrow();
  });

  it("passes when the element has no border classes at all", () => {
    expect(() => expectNoBorder(elWithClass("mb-5 flex items-center"))).not.toThrow();
  });

  it("passes for an element with no class attribute", () => {
    expect(() => expectNoBorder(document.createElement("section"))).not.toThrow();
  });

  it("reads the class list correctly for SVG elements", () => {
    expect(() => expectNoBorder(svgWithClass("border-b"))).toThrow(/border-b/);
    expect(() => expectNoBorder(svgWithClass("h-4 w-4"))).not.toThrow();
  });
});

describe("expectNoBackground", () => {
  it("rejects bg-muted", () => {
    expect(() => expectNoBackground(elWithClass("bg-muted"))).toThrow(/bg-muted/);
  });

  it("does not reject a class that merely contains 'bg' as part of another word", () => {
    expect(() => expectNoBackground(elWithClass("big-badge"))).not.toThrow();
  });

  it("passes when the element has no background classes at all", () => {
    expect(() => expectNoBackground(elWithClass("mb-5 last:mb-0"))).not.toThrow();
  });

  it("reads the class list correctly for SVG elements", () => {
    expect(() => expectNoBackground(svgWithClass("bg-primary"))).toThrow(/bg-primary/);
    expect(() => expectNoBackground(svgWithClass("h-4 w-4"))).not.toThrow();
  });
});
