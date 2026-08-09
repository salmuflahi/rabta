import * as React from "react";
import { cn } from "@/lib/utils";

export type SurfaceVariant = "raised" | "grouped";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "raised" is the one hero surface per screen; "grouped" holds list rows. */
  variant?: SurfaceVariant;
}

/**
 * The only owner of elevation in the app.
 *
 * Depth comes from a hairline shadow ring, not a drawn border: `0 0 0 0.5px
 * <border>` stands in for the edge a `border` utility would otherwise draw,
 * plus (for "raised") a soft blur on top. Cards do not use `border` — the
 * hairline is the first shadow ring, which keeps borders from doubling where
 * a card sits next to a hairline divider. Both variants live in
 * `--shadow-raised` / `--shadow-grouped` so the theme can vary them; Tailwind
 * shadow strings cannot.
 */
export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant = "grouped", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[10px] overflow-hidden",
        variant === "raised" ? "bg-card shadow-raised" : "bg-muted shadow-grouped",
        className,
      )}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";
