import * as React from "react";

import { cn } from "@/lib/utils";
import { ACCENTS, type AccentId } from "@/theme/accent";

const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export interface SwatchProps {
  value: AccentId;
  onChange: (id: AccentId) => void;
  /** Which theme's per-accent hex to render — ACCENTS is keyed by theme, so
   * this must track the app's current theme, not just the accent id. */
  theme: "light" | "dark";
  /** Required — this replaces a native control, so it must have an
   * accessible name of its own rather than relying on visual context. */
  ariaLabel: string;
  className?: string;
}

/**
 * The accent picker — Settings › Appearance in the design handoff: four 18px
 * circles, 9px apart. Confirmed against the prototype's own `swatch` row
 * builder (`Rabta - Console v2.dc.html`, inline script ~line 1459), which the
 * README's prose only approximates: every circle carries
 * `box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.2)` (a hairline self-edge so a
 * light accent doesn't bleed into the surface behind it); the selected
 * circle adds two more rings on top of that same shadow —
 * `0 0 0 1.5px var(--raised), 0 0 0 3.5px <hex>` — a surface-coloured gap
 * ring followed by a ring in the accent's own colour. The prototype's
 * `--raised` is this codebase's `--card` (the raised-surface token; see
 * surface.tsx), never this codebase's own `--accent` (an unrelated neutral
 * grey) — that trap is documented in segmented.tsx's precedent comment.
 *
 * The ring is deliberately a real geometric change (the swatch's rendered
 * footprint grows), not a fill-colour swap: colour is never the only signal
 * for which accent is selected. `aria-checked` gives assistive tech the same
 * fact non-visually.
 *
 * Each accent's hex is per-theme (see `ACCENTS`), so `theme` is a required
 * prop rather than something this component infers — same reasoning as
 * `applyAccent` in src/theme/accent.ts.
 *
 * Hand-rolled WAI-ARIA radiogroup/radio (roving tabindex), matching
 * segmented.tsx's precedent and rationale: no Radix radio-group primitive is
 * a dependency here, and a plain `role="radio"` `<button>` stays styleable
 * like the rest of the app while `aria-checked` supplies correct
 * single-choice semantics.
 */
export const Swatch = React.forwardRef<HTMLDivElement, SwatchProps>(function Swatch(
  { value, onChange, theme, ariaLabel, className },
  ref,
) {
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectIndex = (index: number) => {
    const id = ACCENT_IDS[index];
    if (!id) return;
    onChange(id);
    itemRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = ACCENT_IDS.length;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectIndex((index + 1) % count);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectIndex((index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        selectIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectIndex(count - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onChange(ACCENT_IDS[index]);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-[9px]", className)}
    >
      {ACCENT_IDS.map((id, index) => {
        const selected = id === value;
        const hex = ACCENTS[id][theme].base;
        return (
          <button
            key={id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ACCENTS[id].label}
            title={ACCENTS[id].label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="h-[18px] w-[18px] shrink-0 cursor-default rounded-full border-0"
            style={{
              background: hex,
              boxShadow: selected
                ? `inset 0 0 0 0.5px rgba(0,0,0,.2), 0 0 0 1.5px hsl(var(--card)), 0 0 0 3.5px ${hex}`
                : "inset 0 0 0 0.5px rgba(0,0,0,.2)",
            }}
          />
        );
      })}
    </div>
  );
});
