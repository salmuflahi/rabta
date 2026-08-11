import { cn } from "@/lib/utils";

/**
 * A stand-in for content that has not arrived.
 *
 * A single highlight sweeping left to right, not a pulse: a pulse reads as
 * "this element is doing something", a sweep reads as "this is not real
 * yet", which is what is true. Under reduced motion the sweep is suppressed
 * entirely by the global rule in index.css: the transform stops moving and
 * the authored gradient (transparent → 6%-opacity foreground → transparent)
 * just sits motionless over the muted tint — suppressed, not slowed.
 *
 * The moving highlight lives on `::after`, not on this element itself — the
 * element carries the static `bg-muted` tint and only the pseudo-element's
 * gradient translates. Animating the element itself would slide the whole
 * tinted box out of its own layout position (see RestoreProgress's
 * `animate-restore-shimmer`, src/restore/RestoreExperience.tsx, for the same
 * sibling-element-carries-the-motion shape with a real div instead of a
 * pseudo-element).
 *
 * `aria-hidden` because a screen reader announcing a run of empty boxes is
 * worse than silence; the loading state is announced once, by the live
 * region, rather than once per placeholder.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:animate-skeleton-sweep",
        "after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}
