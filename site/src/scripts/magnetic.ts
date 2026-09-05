/* Rabta: the magnetic button.
 *
 * The primary button in the hero leans a few pixels toward a fine pointer
 * that comes near it, and settles back when it leaves. Six pixels, never
 * more: a button that follows the cursor around is a toy. Only with a real
 * pointer, only with motion allowed.
 */

import { gsap } from "gsap";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

const REACH = 6;

export function initMagnetic(root: ParentNode = document, env: MotionEnv = window as MotionEnv): Teardown {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-magnetic]")];
  const fine = env.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
  if (targets.length === 0 || !fine || reducedMotion(env)) return () => {};

  const offs: Teardown[] = [];
  for (const el of targets) {
    const toX = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const toY = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
    const onMove = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
      toX(Math.max(-1, Math.min(1, dx)) * REACH);
      toY(Math.max(-1, Math.min(1, dy)) * REACH);
    };
    const onLeave = () => {
      toX(0);
      toY(0);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    offs.push(() => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.set(el, { clearProps: "transform" });
    });
  }
  return () => offs.forEach((off) => off());
}
