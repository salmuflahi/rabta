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
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        tertiary: { foreground: "hsl(var(--tertiary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
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
        // View/content entrance — a quiet fade + 4px rise. Used on page
        // switches and, staggered, on card lists. Nothing should *look*
        // animated; it should just feel settled rather than snapping in.
        "page-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "card-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "restore-shimmer": "restore-shimmer 1.1s ease-in-out infinite",
        "restore-pulse": "restore-pulse 1.8s ease-in-out infinite",
        "live-ping": "live-ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "page-in": "page-in 180ms ease-out both",
        "card-in": "card-in 220ms ease-out both",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        // Standard settling ease (Part 17) — smooth ease-out, no overshoot.
        standard: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        standard: "180ms",
        sidebar: "280ms",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(16,37,38,0.06)",
        "soft-md": "0 8px 24px rgba(16,37,38,0.10)",
        // Card surfaces: a soft drop plus a hairline inner top highlight so
        // cards read as raised physical surfaces rather than outlined boxes.
        card: "0 1px 2px rgba(16,37,38,0.05), 0 3px 10px rgba(16,37,38,0.045), inset 0 1px 0 rgba(255,255,255,0.55)",
        "card-hover": "0 6px 20px rgba(16,37,38,0.10), inset 0 1px 0 rgba(255,255,255,0.55)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
