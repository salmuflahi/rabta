import * as React from "react";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Amount incremented/decremented per click. Defaults to 1. */
  step?: number;
  /** Accessible-name stem for the up/down buttons (e.g. "Hub port" ->
   * "Increase Hub port"/"Decrease Hub port"). Required — the buttons carry
   * only a chevron glyph, no visible text label of their own. */
  label: string;
  className?: string;
  id?: string;
}

/**
 * A numeric stepper — Settings › Connectors ("Hub port") in the design
 * handoff: value in tabular mono, then a 17×11 up/down chevron pair sharing
 * a hairline. Confirmed against the prototype's own stepper row markup
 * (`Rabta - Console v2.dc.html`, ~line 1471), which the README's prose only
 * approximates: the value span is
 * `font-family:ui-monospace,...;font-size:12px;font-variant-numeric:
 * tabular-nums`; the button pair sits in a
 * `border-radius:5px;box-shadow:0 0 0 0.5px var(--border)` container — the
 * exact same ring formula as `--shadow-grouped` (see index.css), so that
 * token is reused here rather than hand-rolling an equivalent box-shadow;
 * each button is `width:17px;height:11px;background:var(--secondary);
 * color:var(--text2)` (`--text2` maps to this codebase's
 * `--muted-foreground`, `--secondary` maps 1:1 — see tokens.test.ts), and
 * the up button's `border-bottom:0.5px solid var(--border)` is the shared
 * hairline the brief calls for. Chevron glyphs come from the Console v2
 * sprite (`Icon`), like every other chevron in the app since Phase 2 —
 * Phase 1 built this on lucide because the sprite hadn't reached the
 * shared primitives yet.
 *
 * The prototype's own "Hub port" row has no min/max — `setPref(pref, cur +
 * 1)` is unconditional — but the brief requires this component to respect
 * min/max generally, so that clamping is this component's own addition
 * layered on top of the prototype's geometry.
 *
 * At a boundary the affected button is never given the native `disabled`
 * attribute, which would drop it from the tab order entirely and make it
 * impossible for assistive tech to discover *why* it's inert. Instead it
 * stays a real, enabled, focusable `<button>` — `aria-disabled="true"` plus
 * an accessible name that states the boundary reason
 * ("Increase Hub port — already at maximum") — and its click handler is
 * guarded so the boundary can't be crossed either way.
 */
export const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(function Stepper(
  { value, onChange, min = -Infinity, max = Infinity, step = 1, label, className, id },
  ref,
) {
  const atMax = value >= max;
  const atMin = value <= min;

  const increment = () => {
    if (atMax) return;
    onChange(Math.min(max, value + step));
  };
  const decrement = () => {
    if (atMin) return;
    onChange(Math.max(min, value - step));
  };

  return (
    <div ref={ref} id={id} className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="min-w-[44px] text-right font-mono text-[12px] tabular-nums text-foreground">
        {value}
      </span>
      <div className="inline-flex flex-col overflow-hidden rounded-[5px] shadow-grouped">
        <button
          type="button"
          aria-label={atMax ? `Increase ${label} — already at maximum` : `Increase ${label}`}
          aria-disabled={atMax}
          onClick={increment}
          className={cn(
            "grid h-[11px] w-[17px] cursor-default place-items-center border-0 border-b-[0.5px] border-border bg-secondary text-muted-foreground transition-colors duration-fast hover:bg-hover",
            atMax && "opacity-40 hover:bg-secondary",
          )}
        >
          <Icon name="chevron-up" className="h-2 w-2" />
        </button>
        <button
          type="button"
          aria-label={atMin ? `Decrease ${label} — already at minimum` : `Decrease ${label}`}
          aria-disabled={atMin}
          onClick={decrement}
          className={cn(
            "grid h-[11px] w-[17px] cursor-default place-items-center border-0 bg-secondary text-muted-foreground transition-colors duration-fast hover:bg-hover",
            atMin && "opacity-40 hover:bg-secondary",
          )}
        >
          <Icon name="chevron-down" className="h-2 w-2" />
        </button>
      </div>
    </div>
  );
});
