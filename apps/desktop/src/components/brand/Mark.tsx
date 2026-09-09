import { motion, useReducedMotion } from "motion/react";
import { useStore } from "@/store";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ApprovedWordmark } from "./ApprovedWordmark";
import { FAMILY_PATHS } from "./FamilyEmblem";

/** Workspace's return-loop emblem. The family wordmark remains the primary logo. */
export const MARK_GEOMETRY = {
  viewBox: "0 0 48 48",
  paths: FAMILY_PATHS.workspace,
};
export type MarkMode = "static" | "draw" | "complete";
export type MarkTone = "two-tone" | "mono";
export interface MarkProps {
  mode?: MarkMode;
  tone?: MarkTone;
  className?: string;
  playKey?: string | number;
  title?: string;
}
export function Mark({
  mode = "static",
  tone = "mono",
  className,
  playKey,
  title,
}: MarkProps) {
  const pref = useStore((s) => s.prefs.motion),
    os = useReducedMotion();
  const animate = !os && !prefersReducedMotion(pref) && mode !== "static";
  return (
    <motion.svg
      key={playKey}
      viewBox={MARK_GEOMETRY.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("block", className)}
      initial={false}
      animate={{ scale: 1 }}
    >
      {FAMILY_PATHS.workspace.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          className={
            tone === "two-tone" && i === 1 ? "stroke-primary" : undefined
          }
          initial={animate ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{
            duration: animate ? 0.65 : 0,
            delay: animate ? i * 0.16 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}
    </motion.svg>
  );
}

/**
 * The approved bespoke Rabta wordmark, entirely outlined.
 * `height` is the lockup's rendered cap height in px; the whole thing sizes
 * from that so it can sit in a 16px sidebar row or a 48px sheet header.
 */
export function Lockup({
  capHeight = 14,
  className,
  title = "Rabta",
}: {
  capHeight?: number;
  tone?: MarkTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      className={cn("app-brand-lockup", className)}
      style={{ fontSize: capHeight * 1.65 }}
    >
      <ApprovedWordmark className="approved-wordmark" decorative />
    </span>
  );
}
