import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Swatch } from "./swatch";
import { ACCENTS, type AccentId } from "@/theme/accent";

/** Whole-token class matching — see segmented.test.tsx / row.test.tsx. */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

// NOTE: driven via fireEvent, not `@testing-library/user-event` — not a
// dependency of this package. See segmented.test.tsx / switch-mac.test.tsx.

describe("Swatch", () => {
  it("exposes a radiogroup with the given accessible name", () => {
    render(
      <Swatch value="tangerine" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    expect(screen.getByRole("radiogroup", { name: "Accent" })).toBeInTheDocument();
  });

  it("renders all four accents from ACCENTS", () => {
    render(
      <Swatch value="tangerine" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    for (const id of Object.keys(ACCENTS) as AccentId[]) {
      expect(screen.getByRole("radio", { name: ACCENTS[id].label })).toBeInTheDocument();
    }
  });

  it("marks exactly one option selected via aria-checked, never colour alone", () => {
    render(
      <Swatch value="petrol" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    const radios = screen.getAllByRole("radio");
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Petrol");
  });

  it("gives the selected swatch a distinct shape cue (box-shadow ring), not just a colour change", () => {
    render(
      <Swatch value="sky" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    const selected = screen.getByRole("radio", { name: "Sky" });
    const unselected = screen.getByRole("radio", { name: "Sand" });
    // The selected swatch's box-shadow carries two additional rings (1.5px
    // surface-coloured + 3.5px own-colour) beyond the shared inset hairline
    // every swatch has — a real geometric change, not merely a fill colour.
    // Read the raw `style` attribute rather than the CSSOM `.style.boxShadow`
    // property, which may reformat/reorder a multi-layer box-shadow.
    const selectedStyle = selected.getAttribute("style") || "";
    const unselectedStyle = unselected.getAttribute("style") || "";
    expect(selectedStyle).toMatch(/0 0 0 1\.5px/);
    expect(selectedStyle).toMatch(/0 0 0 3\.5px/);
    expect(unselectedStyle).not.toMatch(/0 0 0 1\.5px/);
    expect(unselectedStyle).not.toMatch(/0 0 0 3\.5px/);
  });

  it("calls onChange with the clicked option's AccentId", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="tangerine" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Sand" }));
    expect(onChange).toHaveBeenCalledWith("sand");
  });

  it("renders each accent's theme-correct hex as its background colour", () => {
    render(
      <Swatch value="tangerine" onChange={() => {}} theme="dark" ariaLabel="Accent" />,
    );
    const petrol = screen.getByRole("radio", { name: "Petrol" });
    // Dark-theme petrol base differs from light-theme petrol base — proves
    // the `theme` prop actually selects the per-theme variant. Read the raw
    // `style` attribute rather than the CSSOM `.style.background` property,
    // which may normalise the hex string to rgb() in some environments.
    expect((petrol.getAttribute("style") || "").toLowerCase()).toContain(
      ACCENTS.petrol.dark.base.toLowerCase(),
    );
  });

  it("moves selection to the next option on ArrowRight, wrapping at the end", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="sand" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    const sand = screen.getByRole("radio", { name: "Sand" });
    sand.focus();
    fireEvent.keyDown(sand, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("tangerine");
  });

  it("moves selection to the previous option on ArrowLeft, wrapping at the start", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="tangerine" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    const tangerine = screen.getByRole("radio", { name: "Tangerine" });
    tangerine.focus();
    fireEvent.keyDown(tangerine, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("sand");
  });

  it("jumps to the first option on Home and the last on End", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="petrol" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    const petrol = screen.getByRole("radio", { name: "Petrol" });
    petrol.focus();
    fireEvent.keyDown(petrol, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("tangerine");
    fireEvent.keyDown(petrol, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("sand");
  });

  it("calls onChange with the focused option's AccentId on Space", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="sand" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    const petrol = screen.getByRole("radio", { name: "Petrol" });
    petrol.focus();
    fireEvent.keyDown(petrol, { key: " " });
    expect(onChange).toHaveBeenCalledWith("petrol");
  });

  it("calls onChange with the focused option's AccentId on Enter", () => {
    const onChange = vi.fn();
    render(
      <Swatch value="sand" onChange={onChange} theme="light" ariaLabel="Accent" />,
    );
    const sky = screen.getByRole("radio", { name: "Sky" });
    sky.focus();
    fireEvent.keyDown(sky, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("sky");
  });

  it("moves keyboard focus onto the newly selected option", () => {
    function Controlled() {
      const [value, setValue] = useState<AccentId>("tangerine");
      return <Swatch value={value} onChange={setValue} theme="light" ariaLabel="Accent" />;
    }
    render(<Controlled />);
    const tangerine = screen.getByRole("radio", { name: "Tangerine" });
    tangerine.focus();
    fireEvent.keyDown(tangerine, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Petrol" })).toHaveFocus();
  });

  it("only the selected option is in tab order — a roving tabindex", () => {
    render(
      <Swatch value="sky" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    const radios = screen.getAllByRole("radio");
    const tabIndexes = radios.map((r) => r.getAttribute("tabindex"));
    expect(tabIndexes.filter((t) => t === "0")).toHaveLength(1);
    expect(tabIndexes.filter((t) => t === "-1")).toHaveLength(3);
  });

  it("renders 18px circles (whole class tokens)", () => {
    render(
      <Swatch value="tangerine" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(hasToken(radio.className, "h-[18px]")).toBe(true);
      expect(hasToken(radio.className, "w-[18px]")).toBe(true);
      expect(hasToken(radio.className, "rounded-full")).toBe(true);
    }
  });

  it("never shows a pointer cursor — macOS controls use cursor: default", () => {
    render(
      <Swatch value="tangerine" onChange={() => {}} theme="light" ariaLabel="Accent" />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(hasToken(radio.className, "cursor-default")).toBe(true);
    }
  });
});
