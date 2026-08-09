/**
 * The one place that answers "is this capability available?".
 *
 * Rabta is entirely free today and every capability returns `true`. This module
 * exists so that when a paid tier lands, gating is a change in one file rather
 * than a search across fifty — retrofitting entitlement checks through a mature
 * codebase is the expensive version of this decision, and it was deliberately
 * avoided by adding the seam early.
 *
 * Rules that keep the seam worth having:
 *
 *   1. Call `hasCapability` at the point of use. Do not cache its result in
 *      module state or copy it into the store — a stale entitlement is worse
 *      than no entitlement.
 *   2. Naming a capability here does NOT gate it. The name is a marker for a
 *      decision not yet made; gating begins the day this function can return
 *      false.
 *   3. Never scatter `if (paid)` checks. If a call site needs to know, it asks
 *      here.
 *
 * On the licence: the repository is MIT, so a build with a flag flipped is
 * forkable. Whatever eventually sells is likely to be something a fork cannot
 * trivially reproduce — a hosted component, a signed and notarised auto-updating
 * build, support — rather than a local boolean. That decision is open, and this
 * module deliberately does not presume it.
 */

/**
 * Capabilities that could plausibly sit behind a tier one day.
 *
 * Provisional and unordered — these are candidates, not a published plan, and
 * none of them is gated. Add to this union when a real decision is made, not
 * when a feature ships.
 */
export type Capability =
  /** Moving a whole setup to another Mac (Settings › Migrate). */
  | "migrate"
  /** More than the free number of registered projects. */
  | "unlimited-projects"
  /** More than the free number of saved capsules. */
  | "unlimited-capsules"
  /** Retaining activity history beyond the free window. */
  | "extended-history";

/**
 * Whether the current install may use `capability`.
 *
 * Always `true` today: everything Rabta does is free, no account, nothing
 * uploaded. Keep it that way until there is a real answer to what a paid tier
 * offers — see the module note above.
 */
export function hasCapability(capability: Capability): boolean {
  // Referenced so the parameter is meaningful to callers and to future
  // implementations, without pretending to branch on it yet.
  void capability;
  return true;
}
