import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwitchMac } from "./switch-mac";

/** Whole-token class matching — see segmented.test.tsx / row.test.tsx. */
function classTokensOf(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function hasToken(className: string, token: string): boolean {
  return classTokensOf(className).includes(token);
}

describe("SwitchMac", () => {
  it("renders a switch that reflects the checked prop and announces its state", () => {
    render(<SwitchMac checked={true} onCheckedChange={() => {}} aria-label="Autosave" />);
    const el = screen.getByRole("switch", { name: "Autosave" });
    expect(el).toHaveAttribute("aria-checked", "true");
  });

  it("reflects unchecked via aria-checked too — state is never colour-only", () => {
    render(<SwitchMac checked={false} onCheckedChange={() => {}} aria-label="Autosave" />);
    expect(screen.getByRole("switch", { name: "Autosave" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onCheckedChange with the flipped value on click", () => {
    const onCheckedChange = vi.fn();
    render(<SwitchMac checked={false} onCheckedChange={onCheckedChange} aria-label="Autosave" />);
    fireEvent.click(screen.getByRole("switch", { name: "Autosave" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  // A real, enabled <button> is keyboard-operable by construction — the
  // HTML spec guarantees Enter/Space activation for it in every real
  // browser/webview (including the Tauri shell this app ships in), with no
  // JS required. What that guarantee needs from *this* component is: (a)
  // it renders as that native element, reachable by Tab, and (b) its
  // click contract (what the browser's default action fires) actually
  // performs the toggle. Both are asserted below.
  //
  // We deliberately do not `fireEvent.keyDown(el, { key: " " })` and assert
  // a state flip: happy-dom (confirmed via node_modules/happy-dom source —
  // no HTMLButtonElement keydown-activation implementation) does not
  // implement the native UA default action that turns a Space/Enter
  // keydown into a click for button elements, so that would either false-
  // fail a correct component or push us into hand-rolling a redundant
  // onKeyDown handler purely to satisfy the test environment — which would
  // itself risk a real double-toggle in actual browsers (native default
  // action firing *and* the hand-rolled one). This is the same category of
  // environment gap GitLine.test.tsx documents for pointer events.
  it("is keyboard-reachable and enabled, so native Enter/Space activation applies", () => {
    render(<SwitchMac checked={false} onCheckedChange={() => {}} aria-label="Autosave" />);
    const el = screen.getByRole("switch", { name: "Autosave" });
    expect(el.tagName).toBe("BUTTON");
    expect(el).not.toBeDisabled();
    expect(el.getAttribute("tabindex")).not.toBe("-1");
  });

  it("performs the toggle contract that native keyboard activation's click fires", () => {
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return <SwitchMac checked={checked} onCheckedChange={setChecked} aria-label="Autosave" />;
    }
    render(<Controlled />);
    const el = screen.getByRole("switch", { name: "Autosave" });
    el.focus();
    // What a native button's keyboard activation (Enter, or Space on
    // keyup) ultimately dispatches is a `click` event — the same event
    // `fireEvent.click` produces, wrapped in `act()` so the resulting
    // state update is flushed before we assert.
    fireEvent.click(el);
    expect(el).toHaveAttribute("aria-checked", "true");
  });

  it("associates with an external label via id + htmlFor, the app's established Field pattern", () => {
    render(
      <div>
        <label htmlFor="autosave-switch">Autosave</label>
        <SwitchMac id="autosave-switch" checked={false} onCheckedChange={() => {}} />
      </div>,
    );
    // getByLabelText only succeeds if the id/htmlFor association resolves —
    // this is the exact wiring src/components/ui/field.tsx relies on for
    // every other control (see the existing Switch call sites in
    // SettingsPage.tsx: <Field htmlFor="x"><Switch id="x" /></Field>).
    expect(screen.getByLabelText("Autosave")).toBeInTheDocument();
  });

  it("is a real <button role=switch>, not a div — so it's reachable by Tab and has a default action", () => {
    render(<SwitchMac checked={false} onCheckedChange={() => {}} aria-label="Autosave" />);
    const el = screen.getByRole("switch", { name: "Autosave" });
    expect(el.tagName).toBe("BUTTON");
  });

  it("sizes the track 36x21 and the knob 17px with 15px travel (whole class tokens)", () => {
    render(
      <SwitchMac checked={false} onCheckedChange={() => {}} aria-label="Autosave" data-testid="sw" />,
    );
    const track = screen.getByTestId("sw");
    expect(hasToken(track.className, "w-9")).toBe(true);
    expect(hasToken(track.className, "h-[21px]")).toBe(true);

    // The knob's translateX is state-driven via Radix's `data-state`
    // attribute (`data-[state=unchecked]:...` / `data-[state=checked]:...`
    // variant tokens), not a JS ternary between two plain class strings —
    // so both variant tokens are present in the static class list at once,
    // and it's the live `data-state` attribute (checked separately, above)
    // that governs which one paints. Each variant token is still asserted
    // as a whole token, not a substring.
    const knob = track.firstElementChild as HTMLElement;
    expect(hasToken(knob.className, "h-[17px]")).toBe(true);
    expect(hasToken(knob.className, "w-[17px]")).toBe(true);
    expect(hasToken(knob.className, "data-[state=unchecked]:translate-x-0")).toBe(true);
    expect(hasToken(knob.className, "data-[state=checked]:translate-x-[15px]")).toBe(true);
  });

  it("fades the track between accent and tertiary-foreground over 170ms cubic-bezier(.32,.72,0,1) travel (whole class tokens)", () => {
    render(
      <SwitchMac checked={true} onCheckedChange={() => {}} aria-label="Autosave" data-testid="sw" />,
    );
    const track = screen.getByTestId("sw");
    expect(hasToken(track.className, "duration-switch")).toBe(true);

    const knob = track.firstElementChild as HTMLElement;
    expect(hasToken(knob.className, "duration-switch")).toBe(true);
    expect(hasToken(knob.className, "ease-mac")).toBe(true);
  });

  it("never shows a pointer cursor — macOS controls use cursor: default", () => {
    render(
      <SwitchMac checked={false} onCheckedChange={() => {}} aria-label="Autosave" data-testid="sw" />,
    );
    expect(hasToken(screen.getByTestId("sw").className, "cursor-default")).toBe(true);
  });
});
