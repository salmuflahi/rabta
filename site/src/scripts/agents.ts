/* Rabta: the terminal, typed.
 *
 * The agents chapter shows a real session: the one command that adds the
 * MCP server, and the briefing an agent gets back. The lines ship complete
 * in the markup; when the terminal scrolls into view they are typed once,
 * commands by the character and output by the word, and then left alone.
 */

import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

gsap.registerPlugin(SplitText);

/** Per character for a command, per word for output. Seconds. */
export const TYPE = { char: 0.03, word: 0.08, gap: 0.32 } as const;

export function initAgents(root: ParentNode = document, env: MotionEnv = window as MotionEnv): Teardown {
  const term = root.querySelector<HTMLElement>("[data-term]");
  if (!term) return () => {};
  const lines = [...term.querySelectorAll<HTMLElement>("[data-term-line]")];
  if (lines.length === 0 || reducedMotion(env) || typeof env.IntersectionObserver !== "function") {
    return () => {};
  }

  term.dataset.term = "pending";
  const splits: SplitText[] = [];
  let tl: gsap.core.Timeline | null = null;

  const type = () => {
    term.dataset.term = "typing";
    tl = gsap.timeline({ onComplete: () => (term.dataset.term = "done") });
    let at = 0.1;
    for (const line of lines) {
      const command = line.dataset.termLine === "cmd";
      const split = SplitText.create(line, { type: command ? "chars" : "words" });
      splits.push(split);
      const units = command ? split.chars : split.words;
      const step = command ? TYPE.char : TYPE.word;
      tl.set(line, { autoAlpha: 1 }, at);
      tl.fromTo(units, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, stagger: step, ease: "none" }, at);
      at += units.length * step + TYPE.gap;
    }
  };

  const observer = new env.IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      type();
    },
    { threshold: 0.35 },
  );
  observer.observe(term);

  return () => {
    observer.disconnect();
    tl?.revert();
    splits.forEach((split) => split.revert());
    delete term.dataset.term;
  };
}
