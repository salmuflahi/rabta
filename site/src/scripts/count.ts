/* Rabta: the one ping.
 *
 * rabta.build counts page views with a single beacon to its own counter,
 * once per page load. It carries the path, the referring site's hostname
 * (never a full URL) and a coarse viewport class. No cookie, no storage, no
 * identifier. If the browser says not to be tracked, nothing is sent at all.
 * The privacy page describes this in the same words.
 */

import { COUNT_ORIGIN } from "../config.ts";

export interface CountEnv {
  navigator: {
    sendBeacon?: (url: string, data: Blob) => boolean;
    globalPrivacyControl?: boolean;
    doNotTrack?: string | null;
  };
  location: { pathname: string; host: string };
  document: { referrer: string };
  innerWidth: number;
}

/** Global Privacy Control and Do Not Track both mean "no". */
export function shouldCount(nav: CountEnv["navigator"]): boolean {
  return !(nav.globalPrivacyControl === true || nav.doNotTrack === "1");
}

export function viewportClass(width: number): "phone" | "tablet" | "desktop" {
  return width < 600 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

/** The referring hostname, or nothing when the visitor came from this site. */
export function referrerHost(referrer: string, ownHost: string): string {
  try {
    const url = new URL(referrer);
    return url.host === ownHost ? "" : url.host;
  } catch {
    return "";
  }
}

export function payload(env: CountEnv): string {
  return JSON.stringify({
    p: env.location.pathname,
    r: referrerHost(env.document.referrer, env.location.host),
    w: viewportClass(env.innerWidth),
  });
}

/** Sends the ping. Returns whether the browser accepted it. */
export function count(env: CountEnv = window as unknown as CountEnv): boolean {
  if (!shouldCount(env.navigator)) return false;
  const send = env.navigator.sendBeacon;
  if (typeof send !== "function") return false;
  /* text/plain is a safelisted type: the beacon goes without a preflight. */
  const body = new Blob([payload(env)], { type: "text/plain" });
  try {
    return send.call(env.navigator, `${COUNT_ORIGIN}/hit`, body);
  } catch {
    return false;
  }
}
