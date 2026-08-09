import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * macOS-shaped switch — Settings › Controls in the design handoff: 36×21
 * track, 17px knob, 15px `translateX` travel, 170ms
 * `cubic-bezier(.32,.72,0,1)`; the track fades between accent and
 * `--tertiary-foreground` over 170ms. Confirmed against the prototype's own
 * toggle row (`Rabta - Console v2.dc.html`, inline script ~line 1465):
 * `trackStyle` is `width:36px;height:21px;...padding:2px;...background:
 * var(--accent)` (prototype's `--accent` is this app's `--primary` — the
 * Task 2 brand accent, not the neutral `--accent` surface token) or
 * `var(--text3)` (`--tertiary-foreground`), with
 * `transition:background-color 170ms ease`; `knobStyle` is
 * `width:17px;height:17px;...transition:transform 170ms
 * cubic-bezier(.32,.72,0,1);transform:translateX(15px | 0)`. The
 * cubic-bezier only applies to the knob's transform in the prototype — the
 * track's colour fade uses plain `ease` — so only the knob gets `ease-mac`.
 *
 * Built on the existing `@radix-ui/react-switch` dependency (same primitive
 * `switch.tsx` already uses) rather than hand-rolled: it already renders a
 * real `<button role="switch" aria-checked>`, so `checked`/`onCheckedChange`
 * are a real controlled contract, an `id` prop plugs straight into the
 * app's established `<Field htmlFor>` label pattern (see
 * SettingsPage.tsx's existing `Switch` call sites), and native `<button>`
 * activation covers Enter/Space for free — nothing here needed hand-rolled
 * ARIA. `switch.tsx` is untouched; Phase 2 migrates its call sites to this
 * one.
 */
const SwitchMac = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[21px] w-9 shrink-0 cursor-default items-center rounded-full border-0 p-0.5 transition-colors duration-switch data-[state=checked]:bg-primary data-[state=unchecked]:bg-tertiary-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[17px] w-[17px] rounded-full bg-white shadow-knob transition-transform duration-switch ease-mac data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
SwitchMac.displayName = "SwitchMac";

export { SwitchMac };
