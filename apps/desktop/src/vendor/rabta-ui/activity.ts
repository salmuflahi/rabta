"use client";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

function subscribeEnvironment(notify: () => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", notify);
  document.addEventListener("visibilitychange", notify);
  return () => {
    preference.removeEventListener("change", notify);
    document.removeEventListener("visibilitychange", notify);
  };
}
const canMove = () =>
  !document.hidden &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverSnapshot = () => false;
/** One shared lifecycle for expensive specimens. Never starts during SSR. */
export function useLiveActivity(
  ref: RefObject<HTMLElement | null>,
  motion: boolean,
) {
  const [visible, setVisible] = useState(false);
  const environment = useSyncExternalStore(
    subscribeEnvironment,
    canMove,
    serverSnapshot,
  );
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return { visible, active: visible && motion && environment };
}
