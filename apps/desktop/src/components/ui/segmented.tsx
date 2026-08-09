import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required — this replaces a native control, so it must have an
   * accessible name of its own rather than relying on visual context. */
  ariaLabel: string;
  className?: string;
}

/**
 * macOS-shaped segmented control — Settings › Controls in the design
 * handoff: a 2px-padded track on `--secondary` (7px radius) whose selected
 * segment is the raised surface (`shadow-raised` — the same token Task 4
 * built for card elevation — plus weight 510). Confirmed against the
 * prototype's own `seg()` helper (`Rabta - Console v2.dc.html`, inline
 * script ~line 1194), which the README's prose only approximates:
 * `border:0;border-radius:5px;padding:3px 10px;...` unselected, and
 * `background:var(--raised);font-weight:510;box-shadow:0 1px 2px
 * var(--shadow),0 0 0 0.5px var(--border)` selected — textually identical
 * to `--shadow-raised`.
 *
 * Hand-rolled WAI-ARIA radiogroup/radio (roving tabindex) rather than a
 * Radix primitive: none of the Radix packages already in this project fits.
 * `@radix-ui/react-tabs` couples selection to a tabpanel this control
 * doesn't have (misusing it here would tell assistive tech there's
 * associated panel content that switches, which isn't true for a
 * preference picker); there is no `@radix-ui/react-radio-group` or
 * `-toggle-group` dependency. A plain `role="radio"` `<button>` keeps the
 * DOM element a real button — styleable exactly like the rest of the app,
 * unlike a native `<input type="radio">` — while `aria-checked` gives
 * assistive tech the correct single-choice semantics, never colour alone.
 */
export const Segmented = React.forwardRef<HTMLDivElement, SegmentedProps>(function Segmented(
  { options, value, onChange, ariaLabel, className },
  ref,
) {
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    itemRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = options.length;
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
        onChange(options[index].value);
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
      className={cn("inline-flex items-center gap-px rounded-[7px] bg-secondary p-0.5", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "cursor-default select-none whitespace-nowrap rounded-[5px] px-2.5 py-[3px] text-[12px] leading-none transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-card font-510 text-foreground shadow-raised"
                : "bg-transparent text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
});
