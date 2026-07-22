import type { CSSProperties } from "react";
import { BRAND_EASE, FOLD_MS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type FoldMarkState = "open" | "folding" | "closed";

/**
 * Inline, animatable rendering of the Rabta "Context Fold" mark.
 *
 * Renders the same three shapes as the static
 * `@/assets/brand/rabta-mark.svg` (petrol rounded square, ivory forward-arrow,
 * tangerine corner-fold triangle) as real SVG elements — inline, rather than
 * an `<img src>` — so the tangerine fold triangle can be transitioned via
 * CSS `transform`.
 *
 * Animation: `open` is at rest. `folding` and `closed` share the same target
 * transform (the fold triangle scales up ~18% from its own top-right corner,
 * and the whole mark settles down to ~0.94 scale from center) — `folding` is
 * the moment the CSS transition kicks off in flight, `closed` is simply the
 * resting endpoint of that same transition, so no separate rule is needed
 * for it. Only `transform` is animated (no filter/blur/box-shadow), via a
 * plain CSS `transition` using the brand ease — so the global
 * `prefers-reduced-motion` rule (which forces `transition-duration: 0.001ms`
 * on `*`) neutralizes it automatically, with no JS branching required here.
 */
export function FoldMark({
  state = "open",
  size = 64,
  className,
}: {
  state?: FoldMarkState;
  size?: number;
  className?: string;
}) {
  const folded = state !== "open";

  const wholeMarkStyle: CSSProperties = {
    transform: folded ? "scale(0.94)" : "scale(1)",
    transformOrigin: "center",
    transformBox: "fill-box",
    transition: `transform ${FOLD_MS}ms ${BRAND_EASE}`,
  };

  const foldTriangleStyle: CSSProperties = {
    transform: folded ? "scale(1.18)" : "scale(1)",
    transformOrigin: "top right",
    transformBox: "fill-box",
    transition: `transform ${FOLD_MS}ms ${BRAND_EASE}`,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Rabta"
      data-fold-state={state}
      className={cn("shrink-0", className)}
    >
      <g style={wholeMarkStyle}>
        <rect width="64" height="64" rx="14" fill="#102526" />
        <path
          fill="#F3F0E8"
          fillRule="evenodd"
          d="M13 8h28.5L56 22.5V51a5 5 0 0 1-5 5H22L8 42V13a5 5 0 0 1 5-5Zm8 13h14v-5l14 16-14 16v-5H25l-8-8V25a4 4 0 0 1 4-4Z"
        />
        <path fill="#FF6B2C" d="M41.5 8v14.5H56Z" style={foldTriangleStyle} />
      </g>
    </svg>
  );
}
