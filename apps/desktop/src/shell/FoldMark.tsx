import type { CSSProperties } from "react";
import { BRAND_EASE, FOLD_MS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type FoldMarkState = "open" | "folding" | "closed";
export type FoldMarkVariant = "corner" | "squash";

/**
 * Inline, animatable rendering of the Rabta "Context Fold" mark.
 *
 * Renders the same three shapes as the static
 * `@/assets/brand/rabta-mark.svg` (petrol rounded square, ivory forward-arrow,
 * tangerine corner-fold triangle) as real, but internally STATIC, SVG
 * elements.
 *
 * **Why the SVG is static and a wrapper animates instead:** an earlier
 * version of this component applied CSS `transform` (with `transform-box:
 * fill-box`) directly to SVG sub-elements (`<g>`, a `<path>`) to animate the
 * fold. That doesn't render reliably in WebKit — this app ships inside a
 * WKWebView, and WebKit does not consistently apply CSS transforms/
 * transitions to SVG child elements, so the fold showed nothing at all, even
 * a trivial whole-`<g>` `scale()`. CSS transforms on plain HTML elements
 * (including 3D `perspective`/`rotate3d`) do not have this problem — they're
 * a core, heavily-used part of the web platform and render reliably in every
 * WebKit build. So the SVG here never changes; a wrapping `<span>` around the
 * whole `<svg>` carries the animated `transform`, and the fold is achieved by
 * turning/squashing that wrapper as one rigid unit.
 *
 * Two motions are offered via `variant` (see the Settings preview, which
 * renders both side by side so the signature motion can be chosen):
 *
 * - `"corner"` (page-corner turn): the wrapper's `transformOrigin` sits at
 *   the top-right corner of the mark and it rotates in 3D
 *   (`rotate3d(1, -1, 0, 55deg)`) around the diagonal axis through that
 *   corner — like turning a page from its corner. The outer wrapper carries
 *   `perspective` so the 3D rotation reads as a fold rather than a 2D skew.
 * - `"squash"` (fold shut): the wrapper's `transformOrigin` is its center and
 *   it scales flat along x (`scaleX(0.12)`) to a thin vertical sliver and
 *   back — a book-style fold shut.
 *
 * Only `transform` is animated (no filter/blur/box-shadow), via a plain CSS
 * `transition` using the brand ease — so the global `prefers-reduced-motion`
 * rule (which forces `transition-duration: 0.001ms` on `*`) neutralizes it
 * automatically, with no JS branching required here.
 */
export function FoldMark({
  state = "open",
  size = 64,
  variant = "corner",
  className,
}: {
  state?: FoldMarkState;
  size?: number;
  variant?: FoldMarkVariant;
  className?: string;
}) {
  const folded = state !== "open";

  const perspectiveWrapperStyle: CSSProperties = {
    display: "inline-block",
    perspective: variant === "corner" ? "420px" : undefined,
  };

  const animatedStyle: CSSProperties =
    variant === "corner"
      ? {
          display: "inline-block",
          transform: folded ? "rotate3d(1, -1, 0, 55deg)" : "none",
          transformOrigin: "100% 0%",
          transition: `transform ${FOLD_MS}ms ${BRAND_EASE}`,
        }
      : {
          display: "inline-block",
          transform: folded ? "scaleX(0.12)" : "none",
          transformOrigin: "center",
          transition: `transform ${FOLD_MS}ms ${BRAND_EASE}`,
        };

  return (
    <span style={perspectiveWrapperStyle} className={cn("shrink-0", className)}>
      <span style={animatedStyle}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          width={size}
          height={size}
          role="img"
          aria-label="Rabta"
          data-fold-state={state}
          data-fold-variant={variant}
        >
          <rect width="64" height="64" rx="14" fill="#102526" />
          <path
            fill="#F3F0E8"
            fillRule="evenodd"
            d="M13 8h28.5L56 22.5V51a5 5 0 0 1-5 5H22L8 42V13a5 5 0 0 1 5-5Zm8 13h14v-5l14 16-14 16v-5H25l-8-8V25a4 4 0 0 1 4-4Z"
          />
          <path fill="#FF6B2C" d="M41.5 8v14.5H56Z" />
        </svg>
      </span>
    </span>
  );
}
