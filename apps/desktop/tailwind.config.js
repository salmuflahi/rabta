/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // The system face. SF Pro on macOS, with automatic optical sizing
        // (SF Text below 20px, SF Display above) — which is most of why a
        // window reads as native.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        // Paths, branch names, URLs, JSON payloads, capability names,
        // keyboard shortcuts and the migration code only — never UI labels.
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      // Mac type scale, retoned to the Console v2 handoff's Typography
      // table. Names are unchanged from the previous web scale so existing
      // text-* usages retone without touching a className; `display`,
      // `sheet`, `secondary` and `payload` are new, added only where the
      // handoff's finer-grained scale has no existing step to carry it.
      // Font *weight* is deliberately not baked into these tuples — the
      // codebase's convention (~70 call sites) is to layer a separate
      // font-medium/font-semibold/etc. class on top of a text-* size, so one
      // size step can serve multiple handoff rows that differ only by
      // weight (e.g. body text vs. its selected/emphasized state).
      fontSize: {
        // Overview date (h1) — 24/640/-0.02em. Larger than `title`; nothing
        // else in the scale reaches 24px, so this is a new step.
        display: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        // Screen title (h1) — 22/640/-0.02em. Was 17px; retoned up.
        title: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        // Sheet title (Migrate flow) — 16/640/-0.015em. New: a Migrate sheet
        // header is a distinct architectural role from a card title, and
        // the handoff lists it as its own row a full step above `card`.
        sheet: ["1rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        // Card title — 14-15/590. Named `card-title`, not `card`: a
        // `card` key here would emit `.text-card` twice, once as a size and
        // once as the `--card` surface colour, and Tailwind's plugin order
        // puts textColor last — so the size silently loses. See the
        // "no fontSize key collides with a colour" test in type.test.ts.
        "card-title": ["0.9375rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        // Section label ("Recent", "Also open") 12/600 and secondary text
        // 12-12.5/400 share a size step in the handoff's own numbers; only
        // weight tells them apart, which lives outside this tuple. New
        // step — nothing existing sits at 12px. Named `sub` rather than
        // `secondary` for the same collision reason as `card-title` above:
        // `--secondary` is a surface colour, and `.text-secondary` can only
        // mean one of the two.
        sub: ["0.75rem", { lineHeight: "1.35" }],
        // Body, list rows, nav (13/400/-0.003em); selected nav + list rows
        // (13/510) and toolbar title (13/590/-0.005em) are the same 13px
        // step with only weight (and, for toolbar title, a sub-pixel
        // 0.002em tracking delta) different — absorbed here rather than
        // forking a near-identical step.
        body: ["0.8125rem", { lineHeight: "1.25", letterSpacing: "-0.003em" }],
        // Meta/timestamps (11.5/400) and mono inline (11.5, untracked)
        // share this step exactly. Retoned from 11px.
        meta: ["0.71875rem", { lineHeight: "1.3" }],
        // Group header (sidebar, palette) — 11/600. Status bar (11,
        // untracked sentence-case) is close in size but wrong in kind for
        // this key's deliberate +0.01em small-caps tracking, so it maps to
        // `meta` instead (0.5px off, but tracking-correct). Unchanged.
        label: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.01em" }],
        // Payload <pre> — 10.5/lh 1.6. Smallest step in the scale, and the
        // only one with a loose line-height (for wrapping JSON). New.
        payload: ["0.65625rem", { lineHeight: "1.6" }],
      },
      // macOS system-font weights the handoff's scale reaches that
      // Tailwind's default scale doesn't name (which stops at 800 in
      // 100-steps): 510 and 590 are real macOS weights, not typos, and 640
      // is this arc's new ceiling (the previous arc capped at 600).
      fontWeight: {
        510: "510",
        590: "590",
        640: "640",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // `hover` binds --primary-hover, which Phase 1 wrote into both
        // themes and applyAccent() repaints per accent, but which nothing
        // could reach from a class until Phase 2 needed `hover:bg-primary-hover`.
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        tertiary: { foreground: "hsl(var(--tertiary-foreground))" },
        // `accent` here is the neutral hover/surface token, NOT the brand
        // accent — that's `primary`. `soft` and `text` are the brand
        // accent's tinted pair (--accent-soft / --accent-text), named after
        // the handoff's own tokens: a soft background with accent-coloured
        // text on it. Never use `primary` for small text on light.
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "var(--accent-soft)",
          text: "hsl(var(--accent-text))",
        },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        // `success` / `warning` / `info` were removed in Phase 2 — the
        // `ok` / `warn` / `bad` trio below is the Console v2 vocabulary and
        // every call site now uses it. There is no `info` successor: the
        // handoff has no informational colour.
        // Console v2 Phase 1, Task 1 — new semantic + surface tokens from
        // the design handoff. `ok`/`warn`/`bad`/`field` are bare HSL
        // triplets in index.css, so they're wrapped in hsl(var(...)) like
        // every other solid colour above. The alpha-carrying tokens
        // (`*-soft`, `hover`, `shadow`, `shadow-lg`, `scrim`) are literal
        // rgba() in index.css and are bound directly below — wrapping
        // them in hsl() would compile to the nonsensical hsl(rgba(...)).
        ok: { DEFAULT: "hsl(var(--ok))", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "hsl(var(--warn))", soft: "var(--warn-soft)" },
        bad: "hsl(var(--bad))",
        field: "hsl(var(--field))",
        hover: "var(--hover)",
        shadow: { DEFAULT: "var(--shadow)", lg: "var(--shadow-lg)" },
        scrim: "var(--scrim)",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        // Restore Experience's PATH-B indeterminate progress shimmer — a
        // gentle left->right highlight while waiting on the final result
        // (no fabricated percentages). See RestoreProgress in
        // src/restore/RestoreExperience.tsx.
        "restore-shimmer": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(220%)" } },
        // View/content entrance — the handoff's `pane-in`: 150ms ease-out,
        // opacity + a 2px rise. Retoned in Phase 2 from 180ms/4px to the
        // Motion table's numbers. Nothing should *look* animated; it should
        // just feel settled rather than snapping in.
        "page-in": { from: { opacity: "0", transform: "translateY(2px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        // Restore Experience's reduced-motion PATH-B indeterminate progress —
        // a neutral full-width track with a gentle opacity-only pulse (no
        // width/transform movement, no fabricated percentage). See
        // RestoreProgress in src/restore/RestoreExperience.tsx.
        "restore-pulse": { "0%, 100%": { opacity: "0.35" }, "50%": { opacity: "0.6" } },
        // "Live" halo behind a connected connector's dot — a slow, gentle ring
        // that expands and fades, so a live connection literally looks alive.
        // Gated on real connection state at the call site; reduced-motion
        // neutralizes it via the global index.css rule.
        "live-ping": {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        // Skeleton stand-in sweep — one highlight travelling left to right.
        // Transform-only so it never triggers layout, and neutralized under
        // reduced motion by the global rule in index.css.
        "skeleton-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "restore-shimmer": "restore-shimmer 1.1s ease-in-out infinite",
        "restore-pulse": "restore-pulse 1.8s ease-in-out infinite",
        "live-ping": "live-ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "page-in": "page-in 150ms ease-out both",
        "skeleton-sweep": "skeleton-sweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        // Standard settling ease (Part 17) — smooth ease-out, no overshoot.
        standard: "cubic-bezier(0.22, 1, 0.36, 1)",
        // Console v2 Phase 1, Task 5 — the handoff's macOS motion curve.
        // Shared by the Switch knob's translateX (this task) and, per the
        // Motion table, the Migrate sheet's slide-down (Phase 2, same
        // curve, 300ms instead of 170ms) — named for the platform, not the
        // control, so that later consumer can reuse it.
        mac: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        standard: "180ms",
        sidebar: "280ms",
        // Console v2 Phase 1, Task 5 — Switch track fade + knob travel.
        // 170ms is otherwise unused in the handoff's Motion table, so this
        // is named for its one consumer rather than kept generic.
        switch: "170ms",
      },
      boxShadow: {
        // Theme-varying, so the values live in CSS variables — Tailwind
        // shadow strings are static and cannot respond to .dark.
        raised: "var(--shadow-raised)",
        grouped: "var(--shadow-grouped)",
        // Console v2 Phase 1, Task 4 — the third elevation level (hairline
        // ring + --shadow-lg's much larger blur/spread) for sheets and the
        // command palette. Not wired to any component in this task; Phase 2
        // (restore sheet, command palette) is the intended consumer.
        modal: "var(--shadow-modal)",
        soft: "0 2px 8px rgba(0,0,0,0.06)",
        // Console v2 Phase 1, Task 5 — the Switch knob's own shadow. A
        // fixed rgba (not a --shadow-* CSS variable) because the prototype
        // keeps it identical in both themes (`0 1px 2px rgba(0,0,0,.3)`,
        // Rabta - Console v2.dc.html support script, the toggle row's
        // knobStyle) — the knob is white on both, so it needs its own
        // constant lift rather than the theme-varying --shadow token.
        knob: "0 1px 2px rgba(0,0,0,.3)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
