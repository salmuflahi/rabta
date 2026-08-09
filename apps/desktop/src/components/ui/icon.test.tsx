import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import spriteSource from "@/assets/icons/rabta-icons.svg?raw";
import { Icon, ICON_NAMES, IconSprite, type IconName } from "./icon";

/** Whole-token class matching — see src/test/no-box.ts. */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

describe("Icon", () => {
  it("renders a <use> referencing the right symbol id for a known name", () => {
    render(<Icon name="overview" data-testid="icon" />);
    const svg = screen.getByTestId("icon");
    expect(svg.tagName).toBe("svg");
    const use = svg.querySelector("use");
    expect(use).not.toBeNull();
    expect(use!.getAttribute("href")).toBe("#ic-overview");
  });

  it("resolves a different known name to its own symbol id", () => {
    render(<Icon name="branch" data-testid="icon" />);
    const use = screen.getByTestId("icon").querySelector("use");
    expect(use!.getAttribute("href")).toBe("#ic-branch");
  });

  it("carries no hardcoded fill or color on the icon wrapper itself", () => {
    render(<Icon name="check" data-testid="icon" />);
    const svg = screen.getByTestId("icon");
    // The colour must come from inheritance (currentColor), never a
    // fill/color the wrapper paints itself — that's what would make the
    // glyph render black instead of the ambient text colour.
    expect(svg.getAttribute("fill")).toBeNull();
    expect(svg.style.color).toBe("");
    expect(hasToken(svg.className, "text-foreground")).toBe(false);
  });

  it("inherits the ambient CSS color from an ancestor (currentColor proof)", () => {
    render(
      <div style={{ color: "rgb(9, 9, 9)" }}>
        <Icon name="overview" data-testid="icon" />
      </div>
    );
    const svg = screen.getByTestId("icon");
    // The wrapper sets no color of its own, so the computed color must be
    // the ancestor's — proving inheritance actually reaches the icon,
    // rather than merely proving the absence of a fill attribute.
    expect(getComputedStyle(svg).color).toBe("rgb(9, 9, 9)");
  });

  it("every symbol in the sprite paints only with currentColor (no hardcoded colour to inherit around)", () => {
    // Static proof over the actual shipped asset: happy-dom can't render
    // the shadow content a <use> clones in, so this closes the gap by
    // checking the source file directly for any fill/stroke value other
    // than "currentColor" or "none".
    const colorAttrs = [...spriteSource.matchAll(/(fill|stroke)="([^"]*)"/g)];
    expect(colorAttrs.length).toBeGreaterThan(0);
    for (const [, , value] of colorAttrs) {
      expect(["currentColor", "none"]).toContain(value);
    }
  });

  it("throws for an unknown icon name instead of rendering an empty box", () => {
    // Bypass the IconName union the way a value coming from outside the
    // type system would (config, a CMS field, a lucide->sprite migration
    // typo) — TypeScript can't stop this string at compile time, so the
    // runtime guard is what has to catch it.
    const bogus = "not-a-real-icon" as unknown as IconName;
    expect(() => render(<Icon name={bogus} />)).toThrow(/unknown icon/i);
  });

  it("ICON_NAMES lists exactly the 35 symbols the handoff sprite ships", () => {
    expect(ICON_NAMES).toHaveLength(35);
    const idsInSprite = [...spriteSource.matchAll(/<symbol id="ic-([a-z-]+)"/g)].map((m) => m[1]);
    expect([...ICON_NAMES].sort()).toEqual([...idsInSprite].sort());
  });

  it("IconSprite injects the sprite's symbol defs into the document once", () => {
    render(<IconSprite />);
    expect(document.getElementById("ic-overview")).not.toBeNull();
    expect(document.getElementById("ic-branch")).not.toBeNull();
  });
});
