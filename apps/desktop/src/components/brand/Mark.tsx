import { motion, useReducedMotion } from "motion/react";
import { useStore } from "@/store";
import { LANDED_SPRING, MARK_DRAW, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CAP_HEIGHT, WORDMARK_ADVANCE, WORDMARK_PATH, WORDMARK_UNITS_PER_EM } from "@/assets/brand/wordmark";

/**
 * The mark: an R whose leg is the Arabic ر of رابطة. Three strokes — stem,
 * bowl, leg — in the order they are drawn. See
 * docs/superpowers/specs/2026-09-03-rabta-brand-redesign-design.md §1.2/§4.
 *
 * Geometry is the brand source (`website/assets/brand/mark.svg`), inlined
 * so `currentColor` inherits from wherever the mark sits. The leg is the
 * ember by default (`two-tone`); pass `tone="mono"` where two colours are
 * not available.
 */
export const MARK_GEOMETRY = {
  viewBox: "0 0 100 100",
  transform: "translate(4.5,-5)",
  strokeWidth: 12,
  stem: "M25 22V84",
  bowl: "M25 28H46a16 16 0 0 1 0 32H25",
  leg: "M44 60c14 4 22 10 22 16 0 5-6 8-13 6",
  /** The stem's height in the 100-unit box: the mark's cap height. */
  capHeight: 62,
  /** y of the baseline (the stem's foot) inside the box, after the transform. */
  baseline: 79,
  /** x of the leg's visual right edge inside the box, after the transform. */
  legTip: 76.5,
} as const;

export type MarkMode = "static" | "draw" | "complete";
export type MarkTone = "two-tone" | "mono";

export interface MarkProps {
  /** `static`: fully drawn. `draw`: strokes draw themselves in order, once.
   * `complete`: drawn, then the leg turns ember and the glyph lands on the
   * spring — the "you're back" moment. */
  mode?: MarkMode;
  tone?: MarkTone;
  className?: string;
  /** Replays the draw when it changes — a restore's run id, for instance. */
  playKey?: string | number;
  title?: string;
}

function useReduced(): boolean {
  const pref = useStore((s) => s.prefs.motion);
  const os = useReducedMotion();
  return Boolean(os) || prefersReducedMotion(pref);
}

/** Seconds, for Motion's transition objects. */
const s = (ms: number) => ms / 1000;

export function Mark({ mode = "static", tone = "two-tone", className, playKey, title }: MarkProps) {
  const reduced = useReduced();
  const animate = !reduced && mode !== "static";
  const legClass = tone === "two-tone" ? "stroke-primary" : undefined;

  const stroke = (name: "stem" | "bowl" | "leg") => {
    const timing = MARK_DRAW[name];
    return animate
      ? {
          initial: { pathLength: 0, opacity: 1 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: s(timing.duration), delay: s(timing.delay), ease: [0.16, 1, 0.3, 1] as const },
        }
      : { initial: false, animate: { pathLength: 1, opacity: 1 } };
  };

  const landed =
    animate && mode === "complete"
      ? {
          initial: { scale: 0.985 },
          animate: { scale: 1 },
          transition: { ...LANDED_SPRING, delay: s(MARK_DRAW.total) },
        }
      : { initial: false, animate: { scale: 1 } };

  return (
    <motion.svg
      key={playKey}
      viewBox={MARK_GEOMETRY.viewBox}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("block overflow-visible", className)}
      style={{ transformOrigin: "50% 50%" }}
      {...landed}
    >
      <g
        transform={MARK_GEOMETRY.transform}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_GEOMETRY.strokeWidth}
        strokeLinejoin="round"
      >
        <motion.path d={MARK_GEOMETRY.stem} {...stroke("stem")} />
        <motion.path d={MARK_GEOMETRY.bowl} {...stroke("bowl")} />
        <motion.path d={MARK_GEOMETRY.leg} className={legClass} {...stroke("leg")} />
      </g>
    </motion.svg>
  );
}

/**
 * The lockup: the mark followed by "abta" as outlines, cap lines aligned.
 * `height` is the lockup's rendered cap height in px; the whole thing sizes
 * from that so it can sit in a 16px sidebar row or a 48px sheet header.
 */
export function Lockup({
  capHeight = 14,
  tone = "two-tone",
  className,
  title = "Rabta",
}: {
  capHeight?: number;
  tone?: MarkTone;
  className?: string;
  title?: string;
}) {
  // Everything in em/1000 units where the wordmark's cap height is CAP_HEIGHT.
  const glyphScale = CAP_HEIGHT / MARK_GEOMETRY.capHeight;
  const glyphBox = 100 * glyphScale;
  const baseline = MARK_GEOMETRY.baseline * glyphScale;
  const gap = 110;
  const wordX = MARK_GEOMETRY.legTip * glyphScale + gap;
  const width = wordX + WORDMARK_ADVANCE;
  const height = glyphBox + 40;
  const px = (capHeight / CAP_HEIGHT) * height;
  const legClass = tone === "two-tone" ? "stroke-primary" : undefined;
  return (
    <svg
      data-brand-mark
      viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
      role="img"
      aria-label={title}
      className={cn("block shrink-0", className)}
      style={{ height: px, width: px * (width / height) }}
    >
      <g
        transform={`scale(${glyphScale.toFixed(4)}) ${MARK_GEOMETRY.transform}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_GEOMETRY.strokeWidth}
        strokeLinejoin="round"
      >
        <path d={MARK_GEOMETRY.stem} />
        <path d={MARK_GEOMETRY.bowl} />
        <path d={MARK_GEOMETRY.leg} className={legClass} />
      </g>
      <path
        d={WORDMARK_PATH}
        fill="currentColor"
        transform={`translate(${wordX.toFixed(1)} ${baseline.toFixed(1)}) scale(${(1000 / WORDMARK_UNITS_PER_EM).toFixed(5)})`}
      />
    </svg>
  );
}
