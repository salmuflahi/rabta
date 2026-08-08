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
 * Depth is a lit plane, not an outlined box: in dark mode a 1px inset top
 * highlight reads as light falling from above, and in light mode — where
 * nothing is brighter than white — a soft two-stage shadow does the same job.
 * Both live in `--shadow-raised` / `--shadow-grouped` so the theme can vary
 * them; Tailwind shadow strings cannot.
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
