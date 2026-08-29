import { useEffect, useRef, useState } from "react";
import { RESTORE_SHEET_EASE, SPRING_EASE, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Rabta's mark — the return glyph — as a living component.
 *
 * The stroke is one continuous path (stem, sweep, run-out), so the mark can
 * draw itself; the arrowhead lands last with a small spring — the state
 * coming back and arriving.
 *
 * Modes:
 *  - "static":   the finished mark, no motion. Also every reduced-motion path.
 *  - "enter":    draw once on mount, head pops, stay. (Brand row.)
 *  - "complete": finish the draw, land the head, settle.
 *
 * Geometry matches src/assets/brand/rabta-mark-*.svg exactly. Colours: the
 * stroke inherits `stroke` (default currentColor); the head is always brand
 * orange — the one permanent orange in chrome, because it is the identity.
 */
export type MarkMode = "static" | "enter" | "complete";

// Path length of the stroke (13 + quarter-arc r12 + 9 ≈ 40.9).
const STROKE_LEN = 42;
const DRAW_MS = 420;

export function AnimatedMark({
  mode = "static",
  size = 32,
  className,
  stroke = "currentColor",
}: {
  mode?: MarkMode;
  size?: number;
  className?: string;
  stroke?: string;
}) {
  const reduced = prefersReducedMotion();
  const still = reduced || mode === "static";

  const [drawn, setDrawn] = useState(still || mode === "complete");
  const [landed, setLanded] = useState(still);
  const prevMode = useRef(mode);

  useEffect(() => {
    if (still) return;
    if (mode === "enter") {
      const a = requestAnimationFrame(() => setDrawn(true));
      const t = setTimeout(() => setLanded(true), DRAW_MS - 80);
      return () => {
        cancelAnimationFrame(a);
        clearTimeout(t);
      };
    }
    if (mode === "complete") {
      setDrawn(true);
      if (prevMode.current !== "complete" && prevMode.current !== "static") {
        const t = setTimeout(() => setLanded(true), 60);
        return () => clearTimeout(t);
      }
      setLanded(true);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, still]);

  useEffect(() => {
    prevMode.current = mode;
  }, [mode]);

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} aria-hidden="true">
      <path
        d="M 48 15 V 28 A 12 12 0 0 1 36 40 H 27"
        fill="none"
        stroke={stroke}
        strokeWidth="7"
        strokeLinecap="round"
        style={{
          strokeDasharray: STROKE_LEN,
          strokeDashoffset: still ? 0 : drawn ? 0 : STROKE_LEN,
          transition: still ? undefined : `stroke-dashoffset ${DRAW_MS}ms ${RESTORE_SHEET_EASE}`,
        }}
      />
      <path
        d="M 15 40 L 29 32.5 L 29 47.5 Z"
        fill="#FF6B2C"
        stroke="#FF6B2C"
        strokeWidth="3.5"
        strokeLinejoin="round"
        style={{
          opacity: still ? 1 : landed ? 1 : 0,
          transform: still ? "none" : landed ? "scale(1)" : "scale(0.5)",
          transformOrigin: "22px 40px",
          transition: still ? undefined : `opacity 160ms ${RESTORE_SHEET_EASE}, transform 260ms ${SPRING_EASE}`,
        }}
      />
    </svg>
  );
}
