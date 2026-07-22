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
 * Animation: `open` is at rest (unchanged brand mark). `folding`/`closed`
 * turn the tangerine corner like a dog-eared page corner, pivoting exactly
 * on its diagonal crease — the hypotenuse from (41.5, 8) to (56, 22.5) —
 * rather than scaling or translating the triangle as a whole (that reads as
 * the flap detaching, which was the bug this replaces).
 *
 * Technique: 2D crease-collapse (the 3D `rotate3d`/`perspective` route was
 * skipped — CSS 3D transforms are not reliably applied to SVG shapes across
 * engines, including the WebKit-based webview this app ships in). The fold
 * triangle's `transform-origin` is `50% 50%` under `transform-box:
 * fill-box`, which lands exactly on the crease midpoint (~48.75, 15.25) —
 * this triangle's bounding-box center coincides with the hypotenuse midpoint
 * because the two legs are axis-aligned and equal length. The transform
 * composes `rotate(45deg) scaleY(k) rotate(-45deg)`: the inner `rotate(-45deg)`
 * aligns the crease direction (1,1) with the local x-axis (so points on the
 * crease have zero local-y and are untouched by the scale) and the
 * perpendicular direction (1,-1) with the local y-axis; `scaleY(k)` then
 * squashes only that perpendicular component; the outer `rotate(45deg)`
 * rotates back. Net effect (worked out algebraically): both crease endpoints
 * are fixed points of the transform for every k, while the free corner
 * (56, 8) moves along the line to the pivot, landing at
 * `pivot + k · (7.25, -7.25)` — i.e. it swings toward the crease as k → 0
 * and back out to the real corner at k = 1. It never leaves that line, so
 * it can't detach. At k = 1 the whole composition reduces to the identity
 * matrix, so `open` renders pixel-identical to the static brand mark.
 *
 * A static, slightly darker triangle (`#E05A1F`) sits underneath the
 * animated one at the same coordinates — at rest it's fully covered, but as
 * the front triangle collapses toward the crease this shows through around
 * the edges, reading as the shaded underside of the turning page corner.
 *
 * Only `transform` is animated (no filter/blur/box-shadow), via a plain CSS
 * `transition` using the brand ease — so the global `prefers-reduced-motion`
 * rule (which forces `transition-duration: 0.001ms` on `*`) neutralizes it
 * automatically, with no JS branching required here.
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

  // Pivot at the crease midpoint (bbox center, which coincides with the
  // hypotenuse midpoint for this triangle) and squash only the component
  // perpendicular to the 45° crease — see the fold-mechanics note above.
  const foldTriangleStyle: CSSProperties = {
    transform: `rotate(45deg) scaleY(${folded ? 0.05 : 1}) rotate(-45deg)`,
    transformOrigin: "50% 50%",
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
        {/* Shaded underside — hidden at rest, revealed at the crease edges as the front triangle collapses. */}
        <path fill="#E05A1F" d="M41.5 8v14.5H56Z" />
        <path fill="#FF6B2C" d="M41.5 8v14.5H56Z" style={foldTriangleStyle} />
      </g>
    </svg>
  );
}
