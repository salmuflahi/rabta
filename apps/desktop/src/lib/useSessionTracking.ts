import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

const IDLE_MS = 60_000;
const HEARTBEAT_MS = 15_000;

export function useSessionTracking() {
  const focusedRef = useRef(false);
  const idleRef = useRef(false);

  useEffect(() => {
    let idleTimeout: number | undefined;
    let updateTail: Promise<unknown> | undefined;

    const report = () => {
      const args = {
        focused: focusedRef.current && !document.hidden,
        idle: idleRef.current,
      };
      const send = () =>
        invoke("session_update", args).catch((error) =>
          console.error("session update failed:", error)
        );
      updateTail = updateTail ? updateTail.then(send) : send();
    };

    const scheduleIdle = () => {
      if (idleTimeout !== undefined) {
        window.clearTimeout(idleTimeout);
      }
      idleTimeout = window.setTimeout(() => {
        idleRef.current = true;
        report();
      }, IDLE_MS);
    };

    const onActivity = () => {
      const wasIdle = idleRef.current;
      idleRef.current = false;
      scheduleIdle();
      if (wasIdle) {
        report();
      }
    };

    const onFocus = () => {
      focusedRef.current = true;
      report();
    };

    const onBlur = () => {
      focusedRef.current = false;
      report();
    };

    const onVisibilityChange = () => {
      focusedRef.current = document.hasFocus();
      report();
    };

    focusedRef.current = document.hasFocus();
    report();
    scheduleIdle();

    window.addEventListener("keydown", onActivity);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("pointermove", onActivity);
    document.addEventListener("scroll", onActivity, true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const heartbeat = window.setInterval(() => {
      void invoke("session_heartbeat").catch((error) =>
        console.error("session heartbeat failed:", error)
      );
    }, HEARTBEAT_MS);

    return () => {
    window.removeEventListener("keydown", onActivity);
    window.removeEventListener("pointerdown", onActivity);
    window.removeEventListener("pointermove", onActivity);
    document.removeEventListener("scroll", onActivity, true);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(heartbeat);
      if (idleTimeout !== undefined) {
        window.clearTimeout(idleTimeout);
      }
    };
  }, []);
}
