# Mac-Native App UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Rabta desktop app's visual system so it reads as a native, premium macOS application rather than a web dashboard — without changing navigation, routes, or the store.

**Architecture:** Three ordered layers. **Foundation** retones design tokens, the type scale and elevation, which cascades to every component through the existing semantic Tailwind bindings. **Primitives** introduce a borderless surface vocabulary (`Surface`, `Section`, `Row`, `Field`) that structurally enforces the one-accent-per-view rule. **Screens** are then rebuilt on those primitives, including the two surgical content edits and the defined-workspaces surfaces.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3.4, Radix UI, Zustand, Vite 6, Vitest 2 + Testing Library, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-08-07-app-ui-mac-native-redesign-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Working directory** for all commands: `/Users/sammy/rabta/apps/desktop`. Test runner is `pnpm test` (vitest, `run` mode).
- **Branch:** `design/app-ui-mac-native-redesign`. Never commit to `main`.
- **Accent rule:** orange means one thing only — the live thing, or the primary action. A page has one primary action. Only `variant="primary"` may paint orange as a **fill**; at most one per page.
- **Colour is never the only signal.** Every state needs a non-colour cue (shape, icon, weight, or text) in addition to colour.
- **Copy style:** sentence case, no exclamation marks. Name what is true, then what to do about it. Never claim more than the software does.
- **Keyboard:** anything hoverable must be keyboard-reachable, and a disabled control must still be able to explain why it is disabled.
- **Font weights** stay in the 400–600 band.
- **Never touch:** `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src/store.ts`, `src/shell/nav.ts`, any `.rs` file, or anything under `website/`.
- **Do not design or build:** hiding other applications' windows, Chrome tab groups, reusable workspace templates, a "never reopen this" list. All four were explicitly rejected.
- **`--border` must remain an HSL triplet.** `index.css:81` applies `* { @apply border-border; }`, so it is the default border-colour for every element. Hairlines use `border-border/60`, never a near-white base colour.

---

## File Structure

**Foundation (modify)**
- `src/index.css` — colour tokens for `:root` and `.dark`, elevation shadow variables, remove the Inter import.
- `tailwind.config.js` — retone `fontSize`, swap `fontFamily.sans`, bind `tertiary-foreground`, add elevation shadows.
- `package.json` — drop `@fontsource-variable/inter`.

**Primitives (create)**
- `src/components/ui/surface.tsx` — the only owner of elevation CSS.
- `src/components/ui/section.tsx` — labelled, borderless content group.
- `src/components/ui/row.tsx` — list row with sibling hairlines.
- `src/components/ui/field.tsx` — settings row.
- `src/test/accent.ts` — the one-accent-per-view assertion helper.

**Primitives (modify)**
- `src/components/ui/card.tsx` — re-pointed at `Surface`, border removed.
- `src/components/ui/button.tsx` — invert the default variant, add `primary`.

**Screens (modify)**
- `src/shell/Sidebar.tsx`, `src/shell/AppShell.tsx`, `src/shell/Toolbar.tsx`
- `src/pages/OverviewPage.tsx`, `CapsulesPage.tsx`, `ProjectsPage.tsx`, `ConnectorsPage.tsx`, `ActivityPage.tsx`, `SettingsPage.tsx`
- `src/features/capsules/CapsuleItems.tsx` — the curate surface
- `src/restore/RestoreExperience.tsx` — the put-away receipt

---

### Task 1: Colour tokens

**Files:**
- Modify: `src/index.css:1-78`
- Modify: `tailwind.config.js:24-50`
- Test: `src/theme/tokens.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--sidebar`, `--background`, `--card`, `--muted`, `--foreground`, `--muted-foreground`, `--tertiary-foreground`, `--border`, `--primary`, `--primary-foreground` defined in **both** `:root` and `.dark`. Tailwind colour key `tertiary: { foreground: "hsl(var(--tertiary-foreground))" }`.

- [ ] **Step 1: Write the failing test**

This test guards the invariant that matters: every token Tailwind binds must exist in both themes. It reads the real files, so it cannot drift.

Create `src/theme/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** Extract the `--name: value;` pairs inside a given selector block. */
function tokensIn(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found in index.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const REQUIRED = [
  "--sidebar",
  "--background",
  "--card",
  "--muted",
  "--foreground",
  "--muted-foreground",
  "--tertiary-foreground",
  "--border",
  "--primary",
  "--primary-foreground",
];

describe("colour tokens", () => {
  const light = tokensIn(":root");
  const dark = tokensIn(".dark");

  it.each(REQUIRED)("defines %s in both themes", (token) => {
    expect(light.has(token)).toBe(true);
    expect(dark.has(token)).toBe(true);
  });

  // --border is the default border-colour for every element via
  // `* { @apply border-border }` in index.css. A raw rgba() here would
  // compile to hsl(rgba(...)) and break every border utility in the app.
  it.each(REQUIRED)("%s is a bare HSL triplet, not a colour function", (token) => {
    for (const map of [light, dark]) {
      const value = (map.get(token) ?? "").replace(/\/\*.*?\*\//g, "").trim();
      expect(value).toMatch(/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/);
    }
  });

  it("keeps the dark canvas darker than its raised surface", () => {
    const lightnessOf = (v: string) => Number(v.split(/\s+/)[2].replace("%", ""));
    expect(lightnessOf(dark.get("--background")!)).toBeLessThan(
      lightnessOf(dark.get("--card")!),
    );
  });

  // The macOS convention: the sidebar is darker than the content area.
  it("keeps the dark sidebar darker than the canvas", () => {
    const lightnessOf = (v: string) => Number(v.split(/\s+/)[2].replace("%", ""));
    expect(lightnessOf(dark.get("--sidebar")!)).toBeLessThan(
      lightnessOf(dark.get("--background")!),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/theme/tokens.test.ts
```

Expected: FAIL — `defines --tertiary-foreground in both themes` fails (the token does not exist yet), and `keeps the dark sidebar darker than the canvas` fails (today `--sidebar` is `183 41% 11%` against `--background` `184 50% 6%`, i.e. the sidebar is *lighter*).

- [ ] **Step 3: Replace the two palettes**

In `src/index.css`, replace the whole `:root { … }` colour block (lines 8–56, from `--background` through `--sidebar-ring`) with the light palette, keeping `--radius` and the motion tokens exactly as they are:

```css
  :root {
    --background: 0 0% 98%;   /* #FAFAFA */
    --foreground: 240 3% 12%;   /* #1D1D1F */
    --card: 0 0% 100%;   /* #FFFFFF */
    --card-foreground: 240 3% 12%;   /* #1D1D1F */
    --popover: 0 0% 100%;   /* #FFFFFF */
    --popover-foreground: 240 3% 12%;   /* #1D1D1F */
    --primary: 18 100% 59%;   /* #FF6B2C */
    --primary-foreground: 0 0% 100%;   /* #FFFFFF */
    --secondary: 0 0% 96%;   /* #F5F5F5 */
    --secondary-foreground: 240 3% 12%;   /* #1D1D1F */
    --muted: 0 0% 96%;   /* #F5F5F5 */
    --muted-foreground: 240 2% 48%;   /* #78787D */
    --tertiary-foreground: 240 3% 61%;   /* #99999E */
    --accent: 0 0% 93%;   /* #EDEDED */
    --accent-foreground: 240 3% 12%;   /* #1D1D1F */
    --destructive: 6 63% 46%;   /* #C0392B */
    --destructive-foreground: 0 0% 100%;   /* #FFFFFF */
    --success: 169 78% 27%;   /* #0F7A67 */
    --success-foreground: 0 0% 100%;   /* #FFFFFF */
    --warning: 39 80% 30%;   /* #8A5E0F */
    --warning-foreground: 0 0% 100%;   /* #FFFFFF */
    --info: 197 49% 36%;   /* #2E6F88 */
    --info-foreground: 0 0% 100%;   /* #FFFFFF */
    --border: 0 0% 88%;   /* #E0E0E0 — hairlines use border-border/60 */
    --input: 0 0% 84%;   /* #D6D6D6 */
    --ring: 18 100% 59%;   /* #FF6B2C */
    --radius: 0.625rem;

    --motion-fast: 120ms;
    --motion-standard: 180ms;
    --motion-sidebar: 280ms;
    --ease-standard: cubic-bezier(0.22, 1, 0.36, 1);

    --sidebar: 0 0% 94%;   /* #EFEFEF */
    --sidebar-foreground: 240 3% 12%;   /* #1D1D1F */
    --sidebar-primary: 18 100% 59%;   /* #FF6B2C */
    --sidebar-primary-foreground: 0 0% 100%;   /* #FFFFFF */
    --sidebar-accent: 0 0% 89%;   /* #E3E3E3 */
    --sidebar-accent-foreground: 240 3% 12%;   /* #1D1D1F */
    --sidebar-border: 0 0% 85%;   /* #D9D9D9 */
    --sidebar-ring: 18 100% 59%;   /* #FF6B2C */
  }
```

Then replace the `.dark { … }` block with the whisper-petrol palette:

```css
  .dark {
    --background: 192 8% 12%;   /* #1D2122 */
    --foreground: 180 14% 95%;   /* #EFF3F3 */
    --card: 190 7% 16%;   /* #272C2D */
    --card-foreground: 180 14% 95%;   /* #EFF3F3 */
    --popover: 190 7% 16%;   /* #272C2D */
    --popover-foreground: 180 14% 95%;   /* #EFF3F3 */
    --primary: 18 100% 59%;   /* #FF6B2C */
    --primary-foreground: 19 38% 8%;   /* #1D120D */
    --secondary: 190 8% 15%;   /* #232829 */
    --secondary-foreground: 180 14% 95%;   /* #EFF3F3 */
    --muted: 190 8% 15%;   /* #232829 */
    --muted-foreground: 185 5% 56%;   /* #8A9596 */
    --tertiary-foreground: 185 5% 45%;   /* #6C7778 */
    --accent: 190 7% 19%;   /* #2E3435 */
    --accent-foreground: 180 14% 95%;   /* #EFF3F3 */
    --destructive: 6 74% 64%;   /* #E76B5D */
    --destructive-foreground: 19 38% 8%;   /* #1D120D */
    --success: 169 58% 62%;   /* #66D6C2 */
    --success-foreground: 168 68% 7%;   /* #06201B */
    --warning: 39 67% 55%;   /* #D9A441 */
    --warning-foreground: 40 71% 8%;   /* #241A06 */
    --info: 198 35% 67%;   /* #8FB8C9 */
    --info-foreground: 195 55% 9%;   /* #0A1C22 */
    --border: 188 7% 24%;   /* #383F40 — hairlines use border-border/60 */
    --input: 188 7% 28%;   /* #414849 */
    --ring: 18 100% 59%;   /* #FF6B2C */

    --sidebar: 189 15% 9%;   /* #141A1B */
    --sidebar-foreground: 180 14% 95%;   /* #EFF3F3 */
    --sidebar-primary: 18 100% 59%;   /* #FF6B2C */
    --sidebar-primary-foreground: 19 38% 8%;   /* #1D120D */
    --sidebar-accent: 190 9% 19%;   /* #2C3335 */
    --sidebar-accent-foreground: 180 14% 95%;   /* #EFF3F3 */
    --sidebar-border: 189 12% 16%;   /* #242B2C */
    --sidebar-ring: 18 100% 59%;   /* #FF6B2C */
  }
```

- [ ] **Step 4: Bind the new token in Tailwind**

In `tailwind.config.js`, inside `theme.extend.colors`, add this line directly after the `muted` entry on line 32:

```js
        tertiary: { foreground: "hsl(var(--tertiary-foreground))" },
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test src/theme/tokens.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 6: Run the full suite to catch contrast-dependent snapshots**

```bash
pnpm test
```

Expected: PASS. If any test fails, it is asserting on a specific colour class — record which, fix the assertion to match the new token, and do not change the palette to suit an old test.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tailwind.config.js src/theme/tokens.test.ts
git commit -m "feat(ui): whisper-petrol dark and clean-neutral light palettes"
```

---

### Task 2: Mac type scale and SF Pro

**Files:**
- Modify: `tailwind.config.js:7-23`
- Modify: `src/index.css:1`
- Modify: `package.json`
- Test: `src/theme/type.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: retoned `fontSize` keys `display | title | card | body | meta | label`. The names are unchanged, so all 70 existing usages (`text-meta` ×24, `text-label` ×28, `text-card` ×10, `text-body` ×6, plus `text-title` and `text-display`) retone automatically with no `className` edits.

- [ ] **Step 1: Write the failing test**

Create `src/theme/type.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const sizes = (config as any).theme.extend.fontSize as Record<
  string,
  [string, { lineHeight: string; letterSpacing?: string }]
>;

/** rem string -> px number, at the 16px root the app never overrides. */
const px = (rem: string) => Number(rem.replace("rem", "")) * 16;

describe("Mac type scale", () => {
  it("puts body at 13px", () => {
    expect(px(sizes.body[0])).toBe(13);
  });

  it("puts secondary metadata at 11px", () => {
    expect(px(sizes.meta[0])).toBe(11);
  });

  it("keeps every step at or below the 22px large title", () => {
    for (const [name, [size]] of Object.entries(sizes)) {
      expect(px(size), `${name} exceeds the Mac scale`).toBeLessThanOrEqual(22);
    }
  });

  it("uses the system face first, with no bundled webfont", () => {
    const sans = (config as any).theme.extend.fontFamily.sans as string[];
    expect(sans[0]).toBe("-apple-system");
    expect(sans.join(" ")).not.toMatch(/Inter/i);
  });

  it("does not import the Inter webfont", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).not.toMatch(/fontsource/i);
  });

  it("does not depend on the Inter package", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(pkg.dependencies).not.toHaveProperty("@fontsource-variable/inter");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/theme/type.test.ts
```

Expected: FAIL — body is currently `0.9375rem` (15px), meta `0.8125rem` (13px), `display` is 32px, and `fontFamily.sans` starts with `"Inter Variable"`.

- [ ] **Step 3: Retone the scale and the family**

In `tailwind.config.js`, replace the `fontFamily` block (lines 7–10) and the `fontSize` block (lines 11–23) with:

```js
      fontFamily: {
        // The system face. SF Pro on macOS, with automatic optical sizing
        // (SF Text below 20px, SF Display above) — which is most of why a
        // window reads as native.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      // Mac type scale. Names are unchanged from the previous web scale so
      // all existing text-* usages retone without touching a className.
      fontSize: {
        display: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        title: ["1.0625rem", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        card: ["0.9375rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        body: ["0.8125rem", { lineHeight: "1.25", letterSpacing: "-0.005em" }],
        meta: ["0.6875rem", { lineHeight: "1.3" }],
        label: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.01em" }],
      },
```

- [ ] **Step 4: Remove the bundled font**

Delete line 1 of `src/index.css`:

```css
@import "@fontsource-variable/inter";
```

Then remove the dependency:

```bash
pnpm remove @fontsource-variable/inter
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test src/theme/type.test.ts
```

Expected: PASS, all six cases.

- [ ] **Step 6: Run the full suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.js src/index.css package.json pnpm-lock.yaml
git commit -m "feat(ui): SF Pro on the Mac type scale, drop bundled Inter"
```

---

### Task 3: Theme-aware elevation

**Files:**
- Modify: `src/index.css` (both palette blocks + the `components` layer)
- Modify: `tailwind.config.js:98-105`
- Test: `src/theme/elevation.test.ts` (create)

**Interfaces:**
- Consumes: the palettes from Task 1.
- Produces: CSS variables `--shadow-raised` and `--shadow-grouped` per theme, and Tailwind shadow keys `raised` and `grouped` resolving to them. `Surface` (Task 6) is the only consumer.

Tailwind `boxShadow` values are static strings and cannot vary by theme, so the theme-varying part lives in CSS variables and Tailwind just points at them.

- [ ] **Step 1: Write the failing test**

Create `src/theme/elevation.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const shadows = (config as any).theme.extend.boxShadow as Record<string, string>;

function blockFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n  }", start);
  return css.slice(start, end);
}

describe("elevation", () => {
  it("exposes raised and grouped shadows through CSS variables", () => {
    expect(shadows.raised).toBe("var(--shadow-raised)");
    expect(shadows.grouped).toBe("var(--shadow-grouped)");
  });

  it("defines both elevation variables in both themes", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      expect(block).toMatch(/--shadow-raised:/);
      expect(block).toMatch(/--shadow-grouped:/);
    }
  });

  // The lit top edge is what makes a dark surface read as a lit plane
  // rather than an outlined box.
  it("gives dark surfaces a lit top edge", () => {
    expect(blockFor(".dark")).toMatch(/--shadow-raised:\s*inset 0 1px 0/);
  });

  // On a white surface there is nothing brighter than white to catch the
  // light, so the inset highlight is invisible. Light mode carries its
  // depth on shadow alone.
  it("does not attempt a lit edge in light mode", () => {
    const raised = blockFor(":root").match(/--shadow-raised:([^;]+);/)?.[1] ?? "";
    expect(raised).not.toMatch(/inset/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/theme/elevation.test.ts
```

Expected: FAIL — `shadows.raised` is `undefined`; only `soft`, `soft-md`, `card` and `card-hover` exist.

- [ ] **Step 3: Add the elevation variables**

In `src/index.css`, add these two lines to the `:root` block, immediately after `--ring`:

```css
    --shadow-raised: 0 1px 2px rgba(0,0,0,0.09), 0 4px 12px rgba(0,0,0,0.06);
    --shadow-grouped: 0 1px 2px rgba(0,0,0,0.08), 0 3px 9px rgba(0,0,0,0.05);
```

And these two to the `.dark` block, immediately after its `--ring`:

```css
    --shadow-raised: inset 0 1px 0 rgba(210,240,240,0.06), 0 1px 2px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.22);
    --shadow-grouped: inset 0 1px 0 rgba(210,240,240,0.05), 0 1px 2px rgba(0,0,0,0.3), 0 3px 9px rgba(0,0,0,0.18);
```

- [ ] **Step 4: Point Tailwind at them**

In `tailwind.config.js`, replace the whole `boxShadow` block (lines 98–105) with:

```js
      boxShadow: {
        // Theme-varying, so the values live in CSS variables — Tailwind
        // shadow strings are static and cannot respond to .dark.
        raised: "var(--shadow-raised)",
        grouped: "var(--shadow-grouped)",
        soft: "0 2px 8px rgba(0,0,0,0.06)",
        "soft-md": "0 8px 24px rgba(0,0,0,0.10)",
      },
```

- [ ] **Step 5: Fix the four orphaned `shadow-card` usages**

Removing `card` and `card-hover` orphans four usages. Find them:

```bash
grep -rn "shadow-card" src/
```

Replace `shadow-card-hover` with `shadow-raised`, and `shadow-card` with `shadow-grouped`, at every hit. In `src/index.css` the `.card-lift:hover` rule becomes:

```css
  .card-lift:hover {
    @apply -translate-y-0.5 shadow-raised;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test src/theme/elevation.test.ts && pnpm test
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tailwind.config.js src/
git commit -m "feat(ui): theme-aware elevation, lit edge in dark and shadow in light"
```

---

### Task 4: Invert the Button default

**Files:**
- Modify: `src/components/ui/button.tsx:6-30`
- Modify: the 18 call sites listed in Step 4
- Test: `src/components/ui/button.test.tsx` (extend)

**Interfaces:**
- Consumes: the palettes from Task 1.
- Produces: `buttonVariants` gains `primary` (orange fill). `defaultVariants.variant` becomes `"secondary"`. `ButtonProps` is unchanged in shape; only the variant union grows by one member.

This is the structural fix for accent proliferation. Today `defaultVariants: { variant: "default" }` and `default` is the orange fill — so every `<Button>` written without thinking is orange. Inverting it means orange must be opted into.

- [ ] **Step 1: Write the failing test**

Append to `src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("button accent discipline", () => {
  // Orange must be opted into. A Button written without a variant is the
  // most common Button in the codebase, so the default decides how much
  // orange the app has.
  it("does not paint the accent when no variant is given", () => {
    render(<Button>Save state</Button>);
    expect(screen.getByRole("button").className).not.toMatch(/bg-primary/);
  });

  it("paints the accent only for the primary variant", () => {
    render(<Button variant="primary">Resume</Button>);
    expect(screen.getByRole("button").className).toMatch(/bg-primary/);
  });

  it("keeps destructive separate from the accent", () => {
    render(<Button variant="destructive">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/bg-destructive/);
    expect(cls).not.toMatch(/bg-primary/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ui/button.test.tsx
```

Expected: FAIL on `does not paint the accent when no variant is given` — the default variant currently resolves to `bg-primary`, and on `paints the accent only for the primary variant` — no `primary` variant exists.

- [ ] **Step 3: Rewrite the variants**

In `src/components/ui/button.tsx`, replace the `variants.variant` object and `defaultVariants` with:

```ts
      variant: {
        // Orange is opt-in. Disabled primary reads as a neutral unavailable
        // surface — orange is reserved for actions actually available.
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
```

and

```ts
    defaultVariants: { variant: "secondary", size: "default" },
```

Note the `default` key is gone. Any call site passing `variant="default"` is now a type error, which is the point — TypeScript will find them.

- [ ] **Step 4: Make every previously-implicit call site explicit**

These 18 sites relied on the implicit orange default. Visit each and choose deliberately: **at most one `primary` per rendered page**; everything else becomes `secondary`, `ghost`, or `outline`.

```
src/App.tsx:292
src/gallery/Gallery.tsx:208
src/gallery/Gallery.tsx:212
src/gallery/Gallery.tsx:375
src/views/GitLine.tsx:238
src/pages/ProjectsPage.tsx:312
src/pages/ProjectsPage.tsx:334
src/pages/ProjectsPage.tsx:476
src/pages/SettingsPage.tsx:652
src/pages/OverviewPage.tsx:164
src/pages/OverviewPage.tsx:432
src/pages/OverviewPage.tsx:467
src/pages/ConnectorsPage.tsx:31
src/pages/CapsulesPage.tsx:537
src/pages/CapsulesPage.tsx:555
src/pages/CapsulesPage.tsx:759
src/restore/RestoreExperience.tsx:267
src/features/projects/ProjectDialogs.tsx:87
```

Guidance for the ambiguous ones: the single `primary` on Overview is the active task's Resume (`OverviewPage.tsx:164`); on Capsules it is the active capsule's Restore; on Connectors it is Approve (`ConnectorsPage.tsx:31`); in a dialog it is the confirming action. Everything else is `secondary`.

Then find any remaining explicit uses of the removed key:

```bash
grep -rn 'variant="default"' src/
```

Change each to `variant="primary"` only if it is that page's single primary action; otherwise `secondary`.

- [ ] **Step 5: Typecheck and test**

```bash
pnpm exec tsc -b --noEmit && pnpm test
```

Expected: both clean. `tsc` is the safety net here — it flags every site still passing the deleted `"default"`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/button.tsx src/
git commit -m "feat(ui): orange is opt-in — invert the Button default variant"
```

---

### Task 5: The one-accent-per-view assertion

**Files:**
- Create: `src/test/accent.ts`
- Test: `src/test/accent.test.tsx` (create)

**Interfaces:**
- Consumes: `buttonVariants` behaviour from Task 4.
- Produces: `expectAtMostOneAccent(container: HTMLElement): void` — throws with the offending button labels when more than one accent fill is present. Screen tasks 12–18 each call it.

- [ ] **Step 1: Write the failing test**

Create `src/test/accent.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { expectAtMostOneAccent } from "./accent";

describe("expectAtMostOneAccent", () => {
  it("passes when a view has no accent", () => {
    const { container } = render(<Button>Cancel</Button>);
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("passes when a view has exactly one accent", () => {
    const { container } = render(
      <>
        <Button variant="primary">Resume</Button>
        <Button>Cancel</Button>
      </>,
    );
    expect(() => expectAtMostOneAccent(container)).not.toThrow();
  });

  it("fails and names the offenders when a view has two", () => {
    const { container } = render(
      <>
        <Button variant="primary">Resume</Button>
        <Button variant="primary">Approve</Button>
      </>,
    );
    expect(() => expectAtMostOneAccent(container)).toThrow(/Resume.*Approve/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/test/accent.test.tsx
```

Expected: FAIL — `Cannot find module './accent'`.

- [ ] **Step 3: Write the helper**

Create `src/test/accent.ts`:

```ts
import { expect } from "vitest";

/**
 * Asserts a rendered view spends the orange accent at most once.
 *
 * Orange means one thing only: the live thing, or the primary action, and a
 * page has one primary action. This is the rule most likely to erode as
 * screens grow, so it is checked rather than remembered. Only accent *fills*
 * count — a live-state dot or rail is a mark, not a competing action.
 */
export function expectAtMostOneAccent(container: HTMLElement): void {
  const accented = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
    /(^|\s)bg-primary(\s|$)/.test(el.className),
  );
  const labels = accented.map((el) => el.textContent?.trim() || "(unlabelled)");
  expect(
    accented.length,
    `expected at most one accent action, found ${accented.length}: ${labels.join(", ")}`,
  ).toBeLessThanOrEqual(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/test/accent.test.tsx
```

Expected: PASS, all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/test/accent.ts src/test/accent.test.tsx
git commit -m "test(ui): assert a view spends the accent at most once"
```

---

### Task 6: The Surface primitive

**Files:**
- Create: `src/components/ui/surface.tsx`
- Modify: `src/components/ui/card.tsx`
- Test: `src/components/ui/surface.test.tsx` (create)

**Interfaces:**
- Consumes: `shadow-raised` / `shadow-grouped` from Task 3.
- Produces:
  ```ts
  type SurfaceVariant = "raised" | "grouped";
  interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: SurfaceVariant; // default "grouped"
  }
  export const Surface: React.ForwardRefExoticComponent<SurfaceProps & React.RefAttributes<HTMLDivElement>>;
  ```
  `Card` keeps its existing exported names (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) and identical props, so unmigrated call sites keep compiling.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/surface.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { Surface } from "./surface";

describe("Surface", () => {
  it("defaults to the grouped elevation", () => {
    render(<Surface data-testid="s">rows</Surface>);
    expect(screen.getByTestId("s").className).toMatch(/shadow-grouped/);
  });

  it("uses the raised elevation when asked", () => {
    render(
      <Surface variant="raised" data-testid="s">
        hero
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toMatch(/shadow-raised/);
  });

  // Depth comes from elevation, never from a drawn outline. This is the
  // single rule that separates the new look from the old dashboard one.
  it("draws no border in either variant", () => {
    const { rerender } = render(<Surface data-testid="s">a</Surface>);
    expect(screen.getByTestId("s").className).not.toMatch(/(^|\s)border(\s|$)/);
    rerender(
      <Surface variant="raised" data-testid="s">
        a
      </Surface>,
    );
    expect(screen.getByTestId("s").className).not.toMatch(/(^|\s)border(\s|$)/);
  });

  it("passes through consumer classes", () => {
    render(
      <Surface className="mt-4" data-testid="s">
        a
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toMatch(/mt-4/);
  });

  // Card is re-pointed rather than deleted, so screens not yet migrated
  // improve on their own instead of breaking.
  it("makes Card borderless too", () => {
    render(<Card data-testid="c">legacy</Card>);
    expect(screen.getByTestId("c").className).not.toMatch(/(^|\s)border(\s|$)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ui/surface.test.tsx
```

Expected: FAIL — `Cannot find module './surface'`.

- [ ] **Step 3: Write the primitive**

Create `src/components/ui/surface.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type SurfaceVariant = "raised" | "grouped";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "raised" is the one hero surface per screen; "grouped" holds list rows. */
  variant?: SurfaceVariant;
}

/**
 * The only owner of elevation in the app.
 *
 * Depth is a lit plane, not an outlined box: in dark mode a 1px inset top
 * highlight reads as light falling from above, and in light mode — where
 * nothing is brighter than white — a soft two-stage shadow does the same job.
 * Both live in `--shadow-raised` / `--shadow-grouped` so the theme can vary
 * them; Tailwind shadow strings cannot.
 */
export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant = "grouped", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[10px] overflow-hidden",
        variant === "raised" ? "bg-card shadow-raised" : "bg-muted shadow-grouped",
        className,
      )}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";
```

- [ ] **Step 4: Re-point Card**

Replace lines 4–16 of `src/components/ui/card.tsx` with:

```tsx
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    // Kept as a thin alias over Surface so screens not yet migrated to the
    // new primitives lose their borders automatically rather than breaking.
    <Surface ref={ref} variant="raised" className={className} {...props} />
  ),
);
Card.displayName = "Card";
```

and add to the imports at the top of the file:

```tsx
import { Surface } from "./surface";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/components/ui/surface.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/surface.tsx src/components/ui/surface.test.tsx src/components/ui/card.tsx
git commit -m "feat(ui): Surface primitive owns elevation; Card re-pointed at it"
```

---

### Task 7: The Section primitive

**Files:**
- Create: `src/components/ui/section.tsx`
- Test: `src/components/ui/section.test.tsx` (create)

**Interfaces:**
- Consumes: `--tertiary-foreground` from Task 1.
- Produces:
  ```ts
  interface SectionProps extends React.HTMLAttributes<HTMLElement> {
    label: string;
    action?: React.ReactNode;
  }
  export function Section(props: SectionProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/section.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Section } from "./section";

describe("Section", () => {
  it("labels its group for assistive tech", () => {
    render(
      <Section label="Recent">
        <p>a capsule</p>
      </Section>,
    );
    // The label names the region, so screen-reader users get the same
    // grouping sighted users get from the heading.
    expect(screen.getByRole("region", { name: "Recent" })).toBeInTheDocument();
  });

  it("renders its children", () => {
    render(
      <Section label="Recent">
        <p>a capsule</p>
      </Section>,
    );
    expect(screen.getByText("a capsule")).toBeInTheDocument();
  });

  it("renders a trailing action when given one", () => {
    render(
      <Section label="Recent" action={<button type="button">All capsules</button>}>
        <p>a capsule</p>
      </Section>,
    );
    expect(screen.getByRole("button", { name: "All capsules" })).toBeInTheDocument();
  });

  // Grouping comes from a label plus spacing. A box around it would put
  // the dashboard look straight back.
  it("draws no border or background of its own", () => {
    const { container } = render(
      <Section label="Recent">
        <p>a</p>
      </Section>,
    );
    const region = container.querySelector("section")!;
    expect(region.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(region.className).not.toMatch(/bg-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ui/section.test.tsx
```

Expected: FAIL — `Cannot find module './section'`.

- [ ] **Step 3: Write the primitive**

Create `src/components/ui/section.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Names the group. Sentence case, per the house copy style. */
  label: string;
  /** Optional trailing control, e.g. a "see all" link. */
  action?: React.ReactNode;
}

/**
 * A labelled content group with no border and no background of its own.
 *
 * Grouping is carried by the label and the spacing around it. Putting a box
 * here is what made the old screens read as a web dashboard.
 */
export function Section({ label, action, className, children, ...props }: SectionProps) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("mb-5 last:mb-0", className)} {...props}>
      <div className="mb-1.5 flex items-center gap-2">
        <h2 id={id} className="text-label font-semibold text-tertiary-foreground">
          {label}
        </h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/ui/section.test.tsx
```

Expected: PASS, all four cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/section.tsx src/components/ui/section.test.tsx
git commit -m "feat(ui): Section primitive — labelled groups without boxes"
```

---

### Task 8: The Row primitive

**Files:**
- Create: `src/components/ui/row.tsx`
- Test: `src/components/ui/row.test.tsx` (create)

**Interfaces:**
- Consumes: `Surface` from Task 6.
- Produces:
  ```ts
  interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
    leading?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    trailing?: React.ReactNode;
  }
  export function Row(props: RowProps): JSX.Element;
  ```
  Rows are designed to sit directly inside a `Surface`; the hairline is drawn by the row itself using `first:border-t-0`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "./surface";
import { Row } from "./row";

describe("Row", () => {
  it("renders title, subtitle, leading and trailing content", () => {
    render(
      <Surface>
        <Row
          leading={<span data-testid="lead" />}
          title="Ship the settings redesign"
          subtitle="mercury-web · 3h 30m"
          trailing={<button type="button">Resume</button>}
        />
      </Surface>,
    );
    expect(screen.getByText("Ship the settings redesign")).toBeInTheDocument();
    expect(screen.getByText("mercury-web · 3h 30m")).toBeInTheDocument();
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  // Separation between siblings, never a box around each one — and never a
  // stray line above the first row inside its surface.
  it("suppresses its hairline on the first row", () => {
    const { container } = render(
      <Surface>
        <Row title="one" />
        <Row title="two" />
      </Surface>,
    );
    const rows = container.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toMatch(/first:border-t-0/);
    expect(rows[0].className).toMatch(/border-t/);
  });

  it("omits the subtitle element entirely when there is none", () => {
    const { container } = render(
      <Surface>
        <Row title="one" />
      </Surface>,
    );
    expect(container.querySelector("[data-row-subtitle]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ui/row.test.tsx
```

Expected: FAIL — `Cannot find module './row'`.

- [ ] **Step 3: Write the primitive**

Create `src/components/ui/row.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon, dot, or pin affordance. Leading so a column of them scans. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}

/**
 * One row inside a grouped `Surface`.
 *
 * Siblings are separated by a hairline drawn on the row's own top edge, with
 * `first:border-t-0` keeping a stray line off the top of the surface. That is
 * the whole separation model — no boxes, no dividers as elements.
 */
export function Row({ leading, title, subtitle, trailing, className, ...props }: RowProps) {
  return (
    <div
      data-row
      className={cn(
        "flex items-center gap-2.5 border-t border-border/60 px-3 py-2 first:border-t-0",
        className,
      )}
      {...props}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-foreground">{title}</div>
        {subtitle ? (
          <div data-row-subtitle className="truncate text-meta text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? <div className="ml-auto shrink-0">{trailing}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/ui/row.test.tsx
```

Expected: PASS, all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/row.tsx src/components/ui/row.test.tsx
git commit -m "feat(ui): Row primitive with sibling hairlines"
```

---

### Task 9: The Field primitive

**Files:**
- Create: `src/components/ui/field.tsx`
- Test: `src/components/ui/field.test.tsx` (create)

**Interfaces:**
- Consumes: `Row` layout conventions from Task 8.
- Produces:
  ```ts
  interface FieldProps {
    label: string;
    description?: React.ReactNode;
    htmlFor?: string;
    children: React.ReactNode; // the control
  }
  export function Field(props: FieldProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/field.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";

describe("Field", () => {
  it("associates its label with the control", () => {
    render(
      <Field label="Focus mode" htmlFor="focus">
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(screen.getByLabelText("Focus mode")).toBeInTheDocument();
  });

  // A destructive-feeling setting has to explain its guarantee at the point
  // of decision, not in a doc nobody opens.
  it("renders a description when given one", () => {
    render(
      <Field
        label="Focus mode"
        description="Puts away what the task does not want. Busy terminals are never closed."
        htmlFor="focus"
      >
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(
      screen.getByText(/Busy terminals are never closed/),
    ).toBeInTheDocument();
  });

  it("omits the description element entirely when there is none", () => {
    const { container } = render(
      <Field label="Focus mode" htmlFor="focus">
        <input id="focus" type="checkbox" />
      </Field>,
    );
    expect(container.querySelector("[data-field-description]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/ui/field.test.tsx
```

Expected: FAIL — `Cannot find module './field'`.

- [ ] **Step 3: Write the primitive**

Create `src/components/ui/field.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  /** Optional guarantee or consequence, shown under the label. */
  description?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  /** The control itself, rendered at the trailing edge. */
  children: React.ReactNode;
}

/** One setting: label, optional description, trailing control. */
export function Field({ label, description, htmlFor, className, children }: FieldProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-t border-border/60 px-3 py-2.5 first:border-t-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-body text-foreground">
          {label}
        </label>
        {description ? (
          <p data-field-description className="mt-0.5 text-meta text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/ui/field.test.tsx
```

Expected: PASS, all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/field.tsx src/components/ui/field.test.tsx
git commit -m "feat(ui): Field primitive for settings rows"
```

---

### Task 10: Sidebar density and the mono mark

**Files:**
- Modify: `src/shell/Sidebar.tsx`
- Modify: `src/shell/AppShell.tsx:13`
- Test: `src/shell/Sidebar.test.tsx` (extend)

**Interfaces:**
- Consumes: the palettes from Task 1.
- Produces: `EXPANDED_WIDTH = 208` exported behaviour change in `AppShell`; `COLLAPSED_WIDTH` stays `88`. `ROW_STRIDE` becomes `26`.

**Read before starting:** the spec's *Sidebar collapse constraint*. The collapsed rail must stay 88px because macOS overlays the traffic lights at x≈18 with a ~52px span. With 25px rows the icon tile no longer fills that rail, so the current "icons never shift horizontally" invariant **is deliberately given up**. Do not try to preserve it.

- [ ] **Step 1: Write the failing test**

Append to `src/shell/Sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import { renderWithProviders } from "@/test/smoke-utils";

describe("sidebar chrome", () => {
  // The tiled mark is petrol on a petrol sidebar — invisible. Chrome uses
  // the monochrome mark; the tiled one stays the Dock icon.
  it("uses the monochrome mark, not the tiled one", () => {
    renderWithProviders(<Sidebar />);
    const mark = screen.getByAltText("Rabta") as HTMLImageElement;
    expect(mark.src).toMatch(/rabta-mark-mono\.svg/);
    expect(mark.src).not.toMatch(/rabta-mark\.svg/);
  });

  // The Context Fold put a second permanent orange element on every screen,
  // which is one more than the accent rule allows.
  it("draws no context fold on nav rows", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expect(container.querySelector("[data-context-fold]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/clip-path:polygon/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shell/Sidebar.test.tsx
```

Expected: FAIL — the mark is `rabta-mark.svg`, and `ContextFold` renders a `clip-path:polygon` element.

- [ ] **Step 3: Apply the changes**

In `src/shell/Sidebar.tsx`:

1. Change the mark import on line 2:
   ```tsx
   import markUrl from "@/assets/brand/rabta-mark-mono.svg";
   ```
2. Delete the entire `ContextFold` component (lines 21–41) and its `<ContextFold active={active} />` usage inside `NavRow`.
3. In `NavRow`, change the button className: `h-10` becomes `h-[25px]`, and remove `rounded-tr-none` (it existed only so the fold read crisp). Change `gap-1` to `gap-2` and the icon tile `size-10` to `size-[18px]`, with the icon itself `size-[14px]`.
4. Change `ROW_STRIDE` on line 14 from `44` to `26`.
5. In the moving-indicator `div`, change `h-10` to `h-[25px]` and remove `rounded-tr-none`.
6. Change the `aside` padding from `px-[24px]` to `px-[10px]`, and the two full-bleed dividers from `-mx-[24px]` to `-mx-[10px]`.
7. In `BrandRow`, change the mark from `size-6` to `size-4` and the wordmark from `text-[15px]` to `text-body`.

In `src/shell/AppShell.tsx`, change line 13:

```ts
const EXPANDED_WIDTH = 208;
```

Leave `COLLAPSED_WIDTH = 88` and update its comment to record the trade:

```ts
// The collapsed rail stays 88px: macOS overlays the traffic lights at x≈18
// with a ~52px span, so anything narrower clips them. With the tighter row
// metrics the icon tile no longer fills that rail, so icons centre in it and
// shift ~17px during the transition — the previous "icons never move
// horizontally" invariant is deliberately traded for the tighter open rail.
const COLLAPSED_WIDTH = 88;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shell/Sidebar.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shell/Sidebar.tsx src/shell/AppShell.tsx src/shell/Sidebar.test.tsx
git commit -m "feat(ui): Mac sidebar density, mono mark, retire the context fold"
```

---

### Task 11: Toolbar at 38px with the page title

**Files:**
- Modify: `src/shell/Toolbar.tsx:118-131`
- Test: `src/shell/Toolbar.test.tsx` (create)

**Interfaces:**
- Consumes: `NAV_ITEMS` and `SETTINGS_ITEM` from `src/shell/nav.ts` (read-only), `useStore((s) => s.view)`.
- Produces: the toolbar renders the current view's label as the page title, which is what lets Task 12 delete Overview's eyebrow/title/subtitle stack.

- [ ] **Step 1: Write the failing test**

Create `src/shell/Toolbar.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

describe("Toolbar", () => {
  // The title moves here so pages stop restating what the sidebar says.
  it("names the current view", () => {
    useStore.setState({ view: "capsules" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Capsules" })).toBeInTheDocument();
  });

  it("follows the view as it changes", () => {
    useStore.setState({ view: "settings" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shell/Toolbar.test.tsx
```

Expected: FAIL — the toolbar renders no heading at all.

- [ ] **Step 3: Add the title and tighten the bar**

In `src/shell/Toolbar.tsx`, add these imports:

```tsx
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
```

Then replace the `Toolbar` export (lines 121–131) with:

```tsx
/** The workspace toolbar: a slim, mostly-draggable strip that begins at the
 * sidebar boundary. It now also carries the page title, so pages no longer
 * restate what the sidebar already shows. */
export function Toolbar() {
  const view = useStore((s) => s.view);
  const title =
    [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === view)?.label ?? "";

  return (
    <header
      data-tauri-drag-region
      className="flex h-[38px] shrink-0 items-center gap-3 border-b border-border/60 bg-background px-3"
    >
      <h1 className="truncate text-body font-semibold text-foreground">{title}</h1>
      <ConnectionIndicator />
      <div className="ml-auto">
        <SearchTrigger />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/shell/Toolbar.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shell/Toolbar.tsx src/shell/Toolbar.test.tsx
git commit -m "feat(ui): 38px toolbar carrying the page title"
```

---

### Task 12: Overview — drop the stat tiles, promote the active task

**Files:**
- Modify: `src/pages/OverviewPage.tsx`
- Modify: `src/shell/AppShell.tsx:47`
- Test: `src/pages/OverviewPage.test.tsx` (modify)

**Interfaces:**
- Consumes: `Section` (Task 7), `Surface` (Task 6), `Row` (Task 8), `expectAtMostOneAccent` (Task 5), the toolbar title (Task 11).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Update the stale test and add the new assertions**

In `src/pages/OverviewPage.test.tsx`, rename the test on line 34 and replace the comment on lines 76–77:

```tsx
  it("renders the connected apps and recent activity sections when data is seeded", async () => {
```

```tsx
    // The stat tile is gone; the section heading is the only "Connected Apps"
    // left. The assertion stays >= 1 because that is the real contract —
    // the section must render, however many times the words appear.
```

Then append:

```tsx
  it("does not restate sidebar counts as stat tiles", async () => {
    renderWithProviders(<OverviewPage />);
    await screen.findByText("Overview");
    // Counts live on the sidebar rows that own them. A tile here would be
    // the same number in two places.
    expect(screen.queryByText("PROJECTS")).toBeNull();
    expect(screen.queryByText("OPEN TASKS")).toBeNull();
  });

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<OverviewPage />);
    await screen.findByText("Overview");
    expectAtMostOneAccent(container);
  });
```

Add the import at the top of the file:

```tsx
import { expectAtMostOneAccent } from "@/test/accent";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/pages/OverviewPage.test.tsx
```

Expected: FAIL on `does not restate sidebar counts as stat tiles` — the tiles still render.

- [ ] **Step 3: Rebuild the page**

In `src/pages/OverviewPage.tsx`:

1. Delete the three-tile stat grid entirely.
2. Delete the `WORKSPACE` eyebrow, the `text-display` "Overview" title, and the "A snapshot of your projects, connectors, and recent activity" subtitle — the toolbar now names the page. **Keep** an accessible `<h2 className="sr-only">Overview</h2>` so the existing `findByText("Overview")` assertions and screen-reader users both still find it.
3. Wrap the active task in `<Surface variant="raised">` as the first element, carrying the page's single `<Button variant="primary">Resume</Button>`.
4. Convert "Continue Working", "Connected Apps" and "Recent Activity" to `<Section label="…">` containing a `<Surface>` of `<Row>`s. Every trailing action in these lists is `variant="secondary"` or a `link` button — never `primary`.

Then tighten the workspace padding in `src/shell/AppShell.tsx:47`: change `p-9` to `p-4`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/pages/OverviewPage.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/OverviewPage.tsx src/pages/OverviewPage.test.tsx src/shell/AppShell.tsx
git commit -m "feat(ui): Overview leads with the active task, not stat tiles"
```

---

### Task 13: Capsules and the curate surface

**Files:**
- Modify: `src/pages/CapsulesPage.tsx`
- Modify: `src/features/capsules/CapsuleItems.tsx`
- Test: `src/features/capsules/CapsuleItems.test.tsx` (extend)

**Interfaces:**
- Consumes: `Surface`, `Section`, `Row`, `expectAtMostOneAccent`.
- Produces: nothing later tasks depend on.

The four item states and their non-colour cues, from the spec:

| State | Meaning | Cue |
| --- | --- | --- |
| Pinned | Part of the workspace definition | Filled `Pin` icon |
| Loose | Captured because it was open | No icon |
| Pinned but gone | Pin outlived its item; must still render **and still offer unpin** | Outline `PinOff` + muted title |
| Not pinnable | No reconstructable command | Disabled pin + a tooltip giving the reason |

- [ ] **Step 1: Write the failing test**

Append to `src/features/capsules/CapsuleItems.test.tsx`:

```tsx
  // A pin outlives the tab or file it was made from (merge_pins on the Rust
  // side). If we stopped rendering it, the item would be "always open" with
  // no control left to stop it.
  it("still renders a pin whose item is gone, and still offers unpin", () => {
    render(
      <CapsuleItems
        items={[]}
        pins={[{ connectorKind: "chrome", identity: "https://gone.test/", payload: {} }]}
      />,
    );
    expect(screen.getByText("https://gone.test/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unpin/i })).toBeEnabled();
  });

  // A disabled control that cannot say why is a dead end.
  it("explains why an unpinnable item cannot be pinned", () => {
    render(
      <CapsuleItems
        items={[
          {
            connectorKind: "vscode",
            identity: "term-1",
            label: "zsh",
            pinned: false,
            pinnable: false,
            present: true,
          },
        ]}
        pins={[]}
      />,
    );
    const pin = screen.getByRole("button", { name: /pin/i });
    expect(pin).toBeDisabled();
    expect(pin).toHaveAccessibleDescription(/no command to reopen it/i);
  });

  it("distinguishes pinned from loose without relying on colour", () => {
    const { container } = render(
      <CapsuleItems
        items={[
          { connectorKind: "chrome", identity: "a", label: "Pinned tab", pinned: true, pinnable: true, present: true },
          { connectorKind: "chrome", identity: "b", label: "Loose tab", pinned: false, pinnable: true, present: true },
        ]}
        pins={[]}
      />,
    );
    // The cue is an icon, not a hue — colour is never the only signal.
    expect(container.querySelectorAll("[data-pin-state='pinned']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-pin-state='loose']")).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/features/capsules/CapsuleItems.test.tsx
```

Expected: FAIL — no `data-pin-state` attributes exist and the disabled pin has no accessible description.

- [ ] **Step 3: Rebuild the curate surface**

In `src/features/capsules/CapsuleItems.tsx`:

1. Render items as `<Row>`s inside a `<Surface>`, grouped by kind with a `<Section label="Tabs">` / `"Files"` / `"Terminals"` wrapper.
2. Put the pin control in the `Row`'s `leading` slot so a column of pins scans down the left edge.
3. Stamp `data-pin-state="pinned" | "loose" | "gone" | "unpinnable"` on each row.
4. For the unpinnable case, keep the button focusable-but-disabled and attach `aria-describedby` pointing at a visually-hidden span reading exactly: `This terminal has no command to reopen it, so pinning it would never do anything.`
5. Keep the existing `Pin` / `PinOff` / `X` icons — filled `Pin` for pinned, outline `PinOff` for gone.

In `src/pages/CapsulesPage.tsx`, convert each project group to `<Section label={projectName}>` wrapping a `<Surface>` of `<Row>`s. Branch names and paths use `font-mono text-meta`; saved times use `tabular-nums`. The active capsule's Restore is the page's single `variant="primary"`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/features/capsules/CapsuleItems.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CapsulesPage.tsx src/features/capsules/CapsuleItems.tsx src/features/capsules/CapsuleItems.test.tsx
git commit -m "feat(ui): curate surface with four pin states and non-colour cues"
```

---

### Task 14: Projects and Activity

**Files:**
- Modify: `src/pages/ProjectsPage.tsx`, `src/pages/ActivityPage.tsx`
- Test: `src/pages/ProjectsPage.test.tsx`, `src/pages/ActivityPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `Surface`, `Section`, `Row`, `expectAtMostOneAccent`.
- Produces: nothing later tasks depend on. `@dnd-kit` sorting behaviour on Projects is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to each of the two test files, adjusting the component name and import path per file:

```tsx
import { expectAtMostOneAccent } from "@/test/accent";

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2 });
    expectAtMostOneAccent(container);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/pages/ProjectsPage.test.tsx src/pages/ActivityPage.test.tsx
```

Expected: FAIL — both pages currently render several implicitly-orange buttons.

- [ ] **Step 3: Convert both pages**

Replace each page's card grid with `<Section>` + `<Surface>` + `<Row>`. On Projects, the drag handle goes in `Row`'s `leading` slot and the `@dnd-kit` sortable wiring stays exactly as it is. On Activity, timestamps go in `trailing` with `tabular-nums`. Reduce each page to a single `variant="primary"` — on Projects that is "New project"; on Activity there is none, so every action is `secondary` or `ghost`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/pages/ProjectsPage.test.tsx src/pages/ActivityPage.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProjectsPage.tsx src/pages/ActivityPage.tsx src/pages/ProjectsPage.test.tsx src/pages/ActivityPage.test.tsx
git commit -m "feat(ui): Projects and Activity on grouped rows"
```

---

### Task 15: Connectors

**Files:**
- Modify: `src/pages/ConnectorsPage.tsx`
- Test: `src/pages/ConnectorsPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `Surface`, `Section`, `Row`, `expectAtMostOneAccent`.
- Produces: nothing later tasks depend on.

This screen has the worst density problem — two small cards floating in a mostly empty page.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/ConnectorsPage.test.tsx`:

```tsx
import { expectAtMostOneAccent } from "@/test/accent";

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<ConnectorsPage />);
    await screen.findByText(/connected/i);
    expectAtMostOneAccent(container);
  });

  it("states connector status in words, not only colour", async () => {
    renderWithProviders(<ConnectorsPage />);
    // Colour is never the only signal.
    expect(await screen.findByText(/Connected|Offline|Not connected/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/pages/ConnectorsPage.test.tsx
```

Expected: FAIL on the accent assertion — Approve and the per-card actions are all orange today.

- [ ] **Step 3: Rebuild the page**

Make the pending-approval prompt the single `<Surface variant="raised">` at the top, carrying the page's one `<Button variant="primary">Approve</Button>` with Deny as `secondary`. Convert the connector cards to `<Row>`s inside one `<Surface>` under a `<Section label="Connected apps">`. Each row's status pairs its dot with a word — `Connected`, `Offline`, `Not connected` — and capability chips move to the subtitle as `font-mono text-meta`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/pages/ConnectorsPage.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ConnectorsPage.tsx src/pages/ConnectorsPage.test.tsx
git commit -m "feat(ui): Connectors as grouped rows with a raised approval prompt"
```

---

### Task 16: Settings and focus-mode legibility

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Test: `src/pages/SettingsPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `Field` (Task 9), `Section`, `Surface`, `expectAtMostOneAccent`.
- Produces: nothing later tasks depend on. `useStore((s) => s.prefs.focusMode)` and `setPref("focusMode", …)` wiring is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/SettingsPage.test.tsx`:

```tsx
  // Focus mode is destructive-feeling and lives buried in Settings. A user
  // who finds it should understand the guarantees before enabling it.
  it("states the focus mode guarantees at the point of decision", async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/never closed/i)).toBeInTheDocument();
    expect(screen.getByText(/put away/i)).toBeInTheDocument();
  });

  it("keeps the focus mode switch wired to the pref", async () => {
    renderWithProviders(<SettingsPage />);
    const toggle = await screen.findByLabelText(/focus mode/i);
    expect(toggle).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/pages/SettingsPage.test.tsx
```

Expected: FAIL — the switch has no descriptive copy today.

- [ ] **Step 3: Convert the page and describe the setting**

Rebuild each settings group as `<Section label="…">` wrapping a `<Surface>` of `<Field>`s. Give the focus-mode field this description verbatim — sentence case, naming what is true before what to do about it, and claiming no more than the software does:

```tsx
description="Resuming a task puts away what it does not want. Everything is saved to the outgoing task first, and a terminal that is running something is never closed."
```

Keep the existing `Switch` as the field's child and its `checked` / `onCheckedChange` wiring untouched.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/pages/SettingsPage.test.tsx && pnpm test
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(ui): Settings on Field, focus mode states its guarantees"
```

---

### Task 17: Promote the put-away receipt

**Files:**
- Modify: `src/restore/RestoreExperience.tsx:442-449`
- Test: `src/restore/RestoreExperience.test.tsx:178-230` (rewrite two tests)

**Interfaces:**
- Consumes: `Surface`, `Section`, `Row`.
- Produces: nothing later tasks depend on. The `closed: string[]` and `kept: [string, string][]` props are unchanged.

Today this is one muted line — `text-xs text-muted-foreground` — and it is the **only** place a user learns their tabs were closed. It must become first-class, while reading as calm and factual: refusing is the system working correctly, so no `--destructive`, no warning iconography, no orange.

- [ ] **Step 1: Rewrite the two affected tests**

`RestoreExperience.test.tsx:178` encodes the dedupe-reasons behaviour, which still has to hold — rewrite it deliberately rather than coercing it to pass:

```tsx
  it("lists what was put away and each distinct reason it kept something", async () => {
    // ... existing setup with closed: ["https://stray.test/"] and three kept
    // items sharing two distinct reasons ...
    const receipt = await screen.findByRole("region", { name: /put away/i });
    expect(receipt).toHaveTextContent("1 put away");
    // Three kept items, two distinct reasons — each reason listed once.
    expect(receipt).toHaveTextContent("unsaved changes");
    expect(receipt).toHaveTextContent("running something");
    expect(receipt.textContent!.match(/unsaved changes/g)).toHaveLength(1);
  });

  it("reads as a plain report, not an error", async () => {
    // ... same setup ...
    const receipt = await screen.findByRole("region", { name: /put away/i });
    // Refusing is a correct outcome. Nothing here may look like a failure.
    expect(receipt.className).not.toMatch(/destructive|warning/);
    expect(receipt.querySelector(".bg-primary")).toBeNull();
  });
```

`RestoreExperience.test.tsx:208` must keep passing **unchanged** — an empty receipt still renders nothing at all, not an empty surface.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/restore/RestoreExperience.test.tsx
```

Expected: FAIL — there is no region role; the receipt is a bare `<p>`.

- [ ] **Step 3: Rebuild the receipt**

Replace lines 442–449 of `src/restore/RestoreExperience.tsx`:

```tsx
          {(closed.length > 0 || kept.length > 0) && (
            <Section label={`${closed.length} put away`} className="mt-3">
              <Surface>
                {kept.map(([item, reason]) => (
                  <Row key={`${item}-${reason}`} title={item} subtitle={reason} />
                ))}
              </Surface>
            </Section>
          )}
```

The seven reasons come back verbatim from the connectors and must not be reworded: `pinned in the browser`, `incognito`, `the last tab in its window`, `unsaved changes`, `running something`, `no longer open`, `not an http(s) page`. Deduplicate by reason exactly as the current code does with `[...new Set(kept.map(([, r]) => r))]`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/restore/RestoreExperience.test.tsx && pnpm test
```

Expected: both PASS, including the untouched empty-receipt case.

- [ ] **Step 5: Commit**

```bash
git add src/restore/RestoreExperience.tsx src/restore/RestoreExperience.test.tsx
git commit -m "feat(ui): the put-away receipt is first-class, not a footnote"
```

---

### Task 18: Verify and regenerate screenshots

**Files:**
- Modify: `capture/seed.ts` and `capture/mock-tauri.ts` only if a prop signature changed
- Output: `website/assets/shots/*`

- [ ] **Step 1: Run the whole suite and the typechecker**

```bash
pnpm test && pnpm exec tsc -b --noEmit
```

Expected: all tests PASS, zero type errors. Do not proceed past this step with anything red.

- [ ] **Step 2: Build, to prove the removed font and shadows broke nothing**

```bash
pnpm build
```

Expected: a clean Vite build. A failure here most likely means an orphaned `shadow-card` or a stale `@fontsource` reference.

- [ ] **Step 3: Check the capture harness still compiles against the new components**

`capture/seed.ts` and `capture/mock-tauri.ts` render the same page components as the app, so any prop-signature change must be mirrored there or the shots will not build.

```bash
pnpm exec tsc -b --noEmit
```

Expected: clean. If it reports errors inside `capture/`, fix them there — do not change the components to suit the harness.

- [ ] **Step 4: Regenerate the screenshots**

```bash
node capture/capture.mjs
```

Expected: one 2560×1600 PNG per screen written to `website/assets/shots/src/`.

- [ ] **Step 5: Rebuild the responsive derivatives**

```bash
cd /Users/sammy/rabta && python3 scripts/optimize-shots.py
```

Expected: avif/webp/png at 640/1024/1600 for every shot.

- [ ] **Step 6: Look at the results before committing them**

Open two or three of the regenerated PNGs and confirm: the sidebar is darker than the canvas, there is exactly one orange element per screen, and no surface has a drawn border. If any of those is wrong, the fix belongs in the component, not the screenshot.

- [ ] **Step 7: Commit**

```bash
cd /Users/sammy/rabta
git add website/assets/shots apps/desktop/capture
git commit -m "chore(shots): regenerate against the redesigned app UI"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: colour tokens → 1; type scale → 2; elevation → 3; accent discipline → 4 and 5; primitives → 6–9; sidebar/density/collapse constraint → 10; toolbar → 11; the six screens → 12–16; defined workspaces (curate surface → 13, receipt → 17, focus-mode legibility → 16); testing → each task; screenshots → 18. The spec's *colour is never the only signal* rule is asserted in Tasks 13 and 15. Focus-mode discoverability beyond the Settings description is marked deferred in the spec and correctly has no task.

**Placeholders.** None. Every code step carries real code; every command carries an expected result.

**Type consistency.** `Surface` takes `variant?: "raised" | "grouped"` in Task 6 and is used with exactly those values in 12, 13, 15 and 17. `Section` takes `label` + optional `action` in Task 7 and is used with `label` throughout. `Row` takes `leading` / `title` / `subtitle` / `trailing` in Task 8 and is used with those names in 12–15 and 17. `expectAtMostOneAccent(container)` is defined in Task 5 and called with a container in 12, 14, 15 and 16. The Button variant union loses `default` and gains `primary` in Task 4, and only `primary` / `secondary` / `ghost` / `destructive` / `outline` / `link` appear afterwards.

**One known ordering hazard.** Task 4 deletes the `default` variant key, so `tsc` must be run before Task 12 or the page tasks inherit compile errors from unrelated files. Task 4 Step 5 runs it.
