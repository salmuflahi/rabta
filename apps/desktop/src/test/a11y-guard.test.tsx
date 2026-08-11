import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
// smoke-utils (and its `vi.mock("@tauri-apps/api/core", ...)`) MUST be
// imported before any page: OverviewPage/CapsulesPage/ProjectsPage import
// `invoke` from "@tauri-apps/api/core" at module scope, and Vitest links
// each specifier to whichever module — real or mocked — is first in the
// import graph. Import a page first and its `invoke` binds to the real
// module, which throws ("window.__TAURI_INTERNALS__" doesn't exist in
// happy-dom) the moment the page's loading effect calls it, and all three
// pages quietly fall back to their `LoadError` UI instead of their true
// default content. Confirmed empirically: swapping this import order was
// the difference between "Couldn't load your workspace" and the real
// Overview screen in the same test.
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { ActivityPage } from "@/pages/ActivityPage";
import { CapsulesPage } from "@/pages/CapsulesPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Console v2 Phase 4, Task 15 — a standing guard, not a one-time check. Runs
// every page through the same two accessibility assertions so a future
// icon-only button or a stray positive tabIndex fails CI instead of
// shipping.
//
// IMPORTANT — this must inspect each page's *loaded* content, not its
// skeleton. Two independent loading gates stand between a bare
// `renderWithProviders(<Page />)` and real content:
//
//   1. ConnectorsPage and ActivityPage render `<ConnectorsSkeleton />` /
//      `<ActivitySkeleton />` until the store's `connectorsAndLogLoaded`
//      flag is true. That flag is set exactly once, by App.tsx's own
//      preload effect — these pages never set it themselves, and this file
//      never mounts <App/>, so without seeding it the flag is permanently
//      false and both pages show their (button-free, tabindex-free)
//      skeleton for the entire test. Seeded in `beforeEach` below.
//   2. OverviewPage, CapsulesPage and ProjectsPage each hold their own
//      local `useState(true)` "loading" flag that flips to `false` only
//      after their own effect's `invoke()` call resolves — a real
//      (microtask-scheduled) async gap even though `smoke-utils`' mocked
//      `invoke` resolves immediately. A synchronous assertion right after
//      `render()` still sees their skeleton.
//
// A guard that only ever inspects a skeleton passes on every page
// regardless of what the real content does wrong — worse than no guard,
// since it looks like coverage. `renderPageLoaded` below waits out both
// gates the same way for every page, generically: it polls for the
// disappearance of `Skeleton`'s own sweep marker
// (`after:animate-skeleton-sweep`, src/components/ui/skeleton.tsx) rather
// than any page-specific content, so it works unchanged whether a page has
// a loading phase at all (Settings has none — the wait resolves on its
// first check) or two independent ones layered together.
const PAGES = [
  { name: "Overview", Page: OverviewPage },
  { name: "Capsules", Page: CapsulesPage },
  { name: "Projects", Page: ProjectsPage },
  { name: "Connectors", Page: ConnectorsPage },
  { name: "Activity", Page: ActivityPage },
  { name: "Settings", Page: SettingsPage },
];

beforeEach(() => {
  // Harmless no-op for the four pages that don't read this flag — only
  // Connectors and Activity gate on it (see the module comment above).
  useStore.setState({ connectorsAndLogLoaded: true });
});

async function renderPageLoaded(Page: () => React.ReactElement) {
  const utils = renderWithProviders(<Page />);
  await waitFor(() => {
    expect(utils.container.querySelector('[class*="skeleton-sweep"]')).toBeNull();
  });
  return utils;
}

// Proves renderPageLoaded actually reaches real content rather than timing
// out into a false pass — ActivityPage's Pause/Resume auto-scroll button
// (src/pages/ActivityPage.tsx:161-168) exists only past its loading gate,
// never in ActivitySkeleton. If this regresses to "not found", the guard
// below has gone back to inspecting skeletons.
it("sanity check: reaches ActivityPage's real content, not its skeleton", async () => {
  const { findByRole } = await renderPageLoaded(ActivityPage);
  expect(
    await findByRole("button", { name: /(Pause|Resume) auto-scroll/ }),
  ).toBeInTheDocument();
});

// The three interactive shapes the guard cares about, expressed as ARIA
// roles rather than a CSS selector: implicit role "button" (<button>, or
// anything with an explicit role="button"), implicit role "link" (<a href>
// only — an anchor without href has no role and is rightly excluded), and
// explicit role="option". Mirrors the original `"button, a[href],
// [role='option']"` selector one-for-one, just keyed by role instead of tag.
const INTERACTIVE_ROLES = ["button", "link", "option"] as const;

describe.each(PAGES)("$name accessibility", ({ Page }) => {
  // Was a hand-rolled four-branch attribute check (aria-label,
  // aria-labelledby, textContent, a labelled descendant) that doesn't know
  // about `<label for>` association — the standard mechanism SettingsPage
  // uses for every SwitchMac (SettingRow, src/pages/SettingsPage.tsx:~47,
  // renders `<label htmlFor={id}>` when passed `htmlFor`). That blind spot
  // made the guard report SettingsPage's "Resume last capsule on launch"
  // switch as unnamed when it demonstrably isn't.
  //
  // Fixed by asking the platform instead of re-deriving it: `queryAllByRole`
  // computes each candidate's accessible name via `dom-accessibility-api`'s
  // `computeAccessibleName` (the same accname algorithm a screen reader
  // uses, label association included) — see
  // node_modules/.pnpm/@testing-library+dom@10.4.1/node_modules/@testing-library/dom/dist/queries/role.js.
  // A direct `import { computeAccessibleName } from "dom-accessibility-api"`
  // was tried first per this task's brief, but does not resolve here: it's
  // a transitive dependency of @testing-library/dom, which is itself a
  // transitive dependency from this file's point of view (only
  // @testing-library/react is a direct devDependency) — pnpm's strict,
  // non-hoisted node_modules refuses both as phantom dependencies. Confirmed
  // empirically: `import "dom-accessibility-api"` from a file under
  // src/test/ fails Vite import analysis ("Failed to resolve import"), and
  // apps/desktop/node_modules/@testing-library/ contains only `jest-dom` and
  // `react` — no `dom`, no `dom-accessibility-api`. `@testing-library/react`
  // re-exports the whole of `@testing-library/dom`'s public API (its
  // pure.js does `require("@testing-library/dom")` and spreads every key),
  // which is how `within`/`queryAllByRole` below resolve fine while a bare
  // `dom-accessibility-api` import would not.
  //
  // `name: ""` is not "no filter" — `queryAllByRole` only skips the name
  // filter when `name` is `undefined` (role.js: `if (name === undefined)
  // return true`); a string matcher runs the computed name through the
  // default normalizer (trim + collapse whitespace) and compares for exact
  // equality, so `name: ""` precisely selects "computed accessible name is
  // empty (or whitespace-only)" — i.e. unnamed. `hidden: true` disables
  // queryAllByRole's default visibility filtering, so a currently-hidden
  // interactive element still gets checked, matching the original guard's
  // unconditional `querySelectorAll` scope instead of silently narrowing it.
  it("gives every interactive element an accessible name", async () => {
    const { container } = await renderPageLoaded(Page);
    const unnamed = INTERACTIVE_ROLES.flatMap((role) =>
      within(container).queryAllByRole(role, { hidden: true, name: "" }),
    );
    expect(unnamed.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });

  // A positive tabIndex reorders the whole document's tab sequence, not just
  // this element's. There is never a good reason for one here. No page has
  // been found to fail this one against real content, so every page keeps
  // the plain (must-pass) form.
  it("uses no positive tabIndex", async () => {
    const { container } = await renderPageLoaded(Page);
    const positive = [...container.querySelectorAll("[tabindex]")].filter(
      (el) => Number(el.getAttribute("tabindex")) > 0,
    );
    expect(positive.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });
});
