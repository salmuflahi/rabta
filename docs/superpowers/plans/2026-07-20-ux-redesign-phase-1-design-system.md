# UX Redesign — Phase 1: Design System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a complete, reusable, accessible design system (shadcn/ui on Tailwind 3 + CSS-variable tokens + macOS system font) and a dev-only component gallery to review it — without touching any existing screen's behavior or appearance.

**Architecture:** Vendor shadcn/ui components (Radix primitives + CVA + Tailwind) into `apps/desktop/src/components/ui`, driven by semantic CSS-variable tokens defined in a new `globals.css` and `tailwind.config.js` theme. Add a `@/*` path alias and a minimal vitest harness. A dev-only `#gallery` route renders every component in light + dark for review. Existing screens are left byte-for-byte as they are — they keep working because the neutral palette and `font-mono` classes remain valid; the token layer is purely additive.

**Tech Stack:** React 18, TypeScript 5.6 (strict, `moduleResolution: bundler`), Vite 6, Tailwind 3.4, PostCSS + autoprefixer, shadcn/ui (manual v3 setup), Radix UI, class-variance-authority, tailwind-merge, clsx, lucide-react, sonner, cmdk, vitest + Testing Library.

## Global Constraints

- **Presentation only.** No Tauri `invoke` name, event name, or payload shape changes anywhere in this phase. This phase adds files under `src/components`, `src/lib`, `src/gallery`; it edits only `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `src/index.css`, `src/main.tsx`, `package.json`. It must NOT edit `App.tsx`, `store.ts`, `src/views/*`, or `src/panels/*`.
- **CSP-safe / local-only.** CSP is `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`. Every dependency is bundled from `'self'`. No remote fonts (system stack only), no remote images, no CDN. Icons are inline SVG via `lucide-react`.
- **No visual regression to existing screens.** After this phase the running app (Projects/Debug) looks and behaves exactly as before. The new system is visible only at `#gallery` in dev.
- **Dark is the primary theme; light is fully specified** from the same tokens.
- **System font stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`; monospace: `ui-monospace, "SF Mono", Menlo, monospace` (reserved for code/paths/logs).
- **Spacing 4-based** (`4 8 12 16 24 32 48`); **radius** `--radius: 0.5rem` (sm 6 / md 8 / lg 12 derived); **one accent** (calm blue) for primary/active; semantic `success`/`warning`/`danger`; **all text/bg pairs meet WCAG AA**.
- Run all pnpm commands from repo root `/Users/sammy/omnibus`. Default `node` (v18.20) is fine.

## File structure

```
apps/desktop/
  package.json                      (modify: deps + "test" script)
  tsconfig.json                     (modify: baseUrl + paths @/*)
  vite.config.ts                    (modify: resolve.alias @, test config)
  tailwind.config.js                (modify: darkMode, theme tokens, fonts, animate plugin)
  src/
    index.css                       (modify: token @layer base + globals)
    main.tsx                        (modify: wrap in ThemeProvider + mount Toaster + #gallery branch)
    lib/
      utils.ts                      (new: cn())
      utils.test.ts                 (new: cn() tests)
    components/
      theme-provider.tsx            (new: applies .dark/.light class)
      ui/
        button.tsx  badge.tsx  input.tsx  textarea.tsx  label.tsx      (new)
        card.tsx  skeleton.tsx  kbd.tsx  empty-state.tsx               (new)
        dialog.tsx  dropdown-menu.tsx  context-menu.tsx  tooltip.tsx   (new)
        popover.tsx  select.tsx  tabs.tsx  switch.tsx  command.tsx     (new)
        sonner.tsx                                                     (new: Toaster wrapper)
    gallery/
      Gallery.tsx                   (new: dev-only component showcase)
```

`@/…` resolves to `apps/desktop/src/…`. Every `ui/*` component imports `cn` from `@/lib/utils`.

---

### Task 1: Toolchain — deps, path alias, vitest harness, `cn()`

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/tsconfig.json`
- Modify: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src/lib/utils.ts`
- Test: `apps/desktop/src/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils` — clsx + tailwind-merge class combiner used by every component in later tasks.
- Produces: `@/*` path alias → `src/*`; a `pnpm --filter desktop test` script running vitest.

- [ ] **Step 1: Add dependencies**

Run (from repo root):
```bash
pnpm --filter desktop add \
  class-variance-authority clsx tailwind-merge lucide-react sonner cmdk \
  @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-context-menu @radix-ui/react-tooltip @radix-ui/react-popover \
  @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-label
pnpm --filter desktop add -D \
  tailwindcss-animate vitest @testing-library/react @testing-library/jest-dom jsdom
```
Expected: installs succeed, `apps/desktop/package.json` gains the deps. If a Radix peer warning about React 18 appears, it is benign (all Radix packages support React 18).

- [ ] **Step 2: Add the `test` script**

In `apps/desktop/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add the `@/*` path alias to tsconfig**

Replace `apps/desktop/tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Add the alias + vitest config to Vite**

Replace `apps/desktop/vite.config.ts` with:
```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
});
```

- [ ] **Step 5: Write the failing `cn()` test**

Create `apps/desktop/src/lib/utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });
  it("merges conflicting tailwind classes, last wins", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
  it("resolves conditional objects", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
});
```

- [ ] **Step 6: Run the test, verify it fails**

Run: `pnpm --filter desktop test`
Expected: FAIL — cannot resolve `@/lib/utils` / `cn` is not defined.

- [ ] **Step 7: Implement `cn()`**

Create `apps/desktop/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Run the test, verify it passes**

Run: `pnpm --filter desktop test`
Expected: PASS (4 passing).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml pnpm-lock.yaml apps/desktop/tsconfig.json apps/desktop/vite.config.ts apps/desktop/src/lib/
git commit -m "chore(ui): design-system toolchain — deps, @/* alias, vitest, cn()"
```
(If the lockfile is at repo root only, `git add pnpm-lock.yaml`; adjust to whichever exists.)

---

### Task 2: Design tokens — Tailwind theme, globals, ThemeProvider

**Files:**
- Modify: `apps/desktop/tailwind.config.js`
- Modify: `apps/desktop/src/index.css`
- Create: `apps/desktop/src/components/theme-provider.tsx`
- Modify: `apps/desktop/src/main.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 except that deps (`tailwindcss-animate`) are installed.
- Produces: semantic token classes (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-input`, `bg-card`, `bg-destructive`, `ring-ring`, `bg-success`, `bg-warning`, etc.) consumed by every component in Tasks 3–6; `<ThemeProvider defaultTheme="dark">` and `useTheme()` from `@/components/theme-provider`.

- [ ] **Step 1: Replace the Tailwind theme**

Replace `apps/desktop/tailwind.config.js` with:
```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
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
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] **Step 2: Replace `index.css` with the token layer**

Replace `apps/desktop/src/index.css` with (dark is primary; light fully specified; values chosen for AA contrast):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 12%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 12%;
    --primary: 217 91% 52%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 5% 96%;
    --secondary-foreground: 240 6% 20%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 42%;
    --accent: 240 5% 94%;
    --accent-foreground: 240 6% 15%;
    --destructive: 0 72% 46%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 55% 38%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 42%;
    --warning-foreground: 0 0% 100%;
    --border: 240 6% 88%;
    --input: 240 6% 88%;
    --ring: 217 91% 52%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 6% 8%;
    --foreground: 240 6% 92%;
    --card: 240 6% 11%;
    --card-foreground: 240 6% 92%;
    --popover: 240 6% 11%;
    --popover-foreground: 240 6% 92%;
    --primary: 217 91% 60%;
    --primary-foreground: 240 10% 6%;
    --secondary: 240 4% 16%;
    --secondary-foreground: 240 6% 90%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --accent: 240 4% 18%;
    --accent-foreground: 240 6% 92%;
    --destructive: 0 63% 50%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 50% 45%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 55%;
    --warning-foreground: 240 10% 6%;
    --border: 240 4% 20%;
    --input: 240 4% 22%;
    --ring: 217 91% 60%;
  }
}

@layer base {
  * { @apply border-border; }
  html { -webkit-font-smoothing: antialiased; }
  body { @apply bg-background text-foreground font-sans; }
  :focus-visible { @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

Note: existing screens set their own `bg-neutral-900 font-mono` on their root containers, so they are unaffected by the new `body` defaults — no visual regression.

- [ ] **Step 3: Create the ThemeProvider**

Create `apps/desktop/src/components/theme-provider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
```

- [ ] **Step 4: Wrap the app in ThemeProvider**

Replace `apps/desktop/src/main.tsx` with:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

- [ ] **Step 5: Verify the build still passes and the app is unchanged**

Run: `pnpm --filter desktop build`
Expected: PASS (tsc -b + vite build succeed). The running app still shows the current Projects/Debug UI unchanged (its own `bg-neutral-*`/`font-mono` classes still resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/tailwind.config.js apps/desktop/src/index.css apps/desktop/src/components/theme-provider.tsx apps/desktop/src/main.tsx
git commit -m "feat(ui): design tokens, system font, dark/light theme provider"
```

---

### Task 3: Core primitives — Button, Badge, Input, Textarea, Label, Card, Skeleton, Kbd, EmptyState

**Files:**
- Create: `apps/desktop/src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `card.tsx`, `skeleton.tsx`, `kbd.tsx`, `empty-state.tsx`
- Test: `apps/desktop/src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; token classes from Task 2; `@radix-ui/react-slot`, `@radix-ui/react-label`.
- Produces: `Button` (variants `default|secondary|ghost|destructive|outline|link`, sizes `default|sm|lg|icon`, `asChild`), `buttonVariants`; `Badge` (variants `default|secondary|success|warning|destructive|outline`); `Input`, `Textarea`, `Label`; `Card` + `CardHeader/Title/Description/Content/Footer`; `Skeleton`; `Kbd`; `EmptyState` — all from `@/components/ui/*`.

- [ ] **Step 1: Write the failing Button test**

Create `apps/desktop/src/components/ui/button.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Resume</Button>);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-destructive");
  });
  it("supports asChild (renders as anchor)", () => {
    render(<Button asChild><a href="#x">Link</a></Button>);
    expect(screen.getByRole("link", { name: "Link" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter desktop test button`
Expected: FAIL — cannot resolve `@/components/ui/button`.

- [ ] **Step 3: Implement Button**

Create `apps/desktop/src/components/ui/button.tsx`:
```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  }
);
Button.displayName = "Button";
export { buttonVariants };
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm --filter desktop test button`
Expected: PASS (3 passing).

- [ ] **Step 5: Implement Badge**

Create `apps/desktop/src/components/ui/badge.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { badgeVariants };
```

- [ ] **Step 6: Implement Input, Textarea, Label**

Create `apps/desktop/src/components/ui/input.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
```

Create `apps/desktop/src/components/ui/textarea.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
```

Create `apps/desktop/src/components/ui/label.tsx`:
```tsx
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-medium leading-none text-foreground peer-disabled:opacity-70", className)}
    {...props}
  />
));
Label.displayName = "Label";
```

- [ ] **Step 7: Implement Card, Skeleton, Kbd, EmptyState**

Create `apps/desktop/src/components/ui/card.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />
  )
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
);
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
);
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm text-muted-foreground", className)} {...props} />
);
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-4 pt-0", className)} {...props} />
);
export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-4 pt-0", className)} {...props} />
);
```

Create `apps/desktop/src/components/ui/skeleton.tsx`:
```tsx
import { cn } from "@/lib/utils";
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
```

Create `apps/desktop/src/components/ui/kbd.tsx`:
```tsx
import { cn } from "@/lib/utils";
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
```

Create `apps/desktop/src/components/ui/empty-state.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center", className)}>
      {icon && <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter desktop test && pnpm --filter desktop exec tsc -b`
Expected: PASS (button 3 + cn 4), tsc clean.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/components/ui/
git commit -m "feat(ui): core primitives — button, badge, input, card, skeleton, kbd, empty-state"
```

---

### Task 4: Overlay primitives — Dialog, DropdownMenu, ContextMenu, Tooltip, Popover

**Files:**
- Create: `apps/desktop/src/components/ui/dialog.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `popover.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; Radix deps added in Task 1; token classes from Task 2; `lucide-react` icons (`X`, `Check`, `ChevronRight`, `Circle`).
- Produces: canonical shadcn/ui exports — `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuCheckboxItem`; `ContextMenu*` counterparts; `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`; `Popover, PopoverTrigger, PopoverContent` — all from `@/components/ui/*`.

For each file below, vendor the **canonical shadcn/ui component (Tailwind v3 / CSS-variables variant)** verbatim. These are standard, well-known artifacts: they import `cn` from `@/lib/utils`, wrap the matching `@radix-ui/react-*` primitive (already installed in Task 1), and reference our token classes (`bg-popover`, `text-popover-foreground`, `border`, `bg-accent`, `ring-ring`) — which resolve against Task 2's tokens with no edits. Do **not** rename classes.

- [ ] **Step 1: Vendor `dialog.tsx`** — canonical shadcn Dialog (wraps `@radix-ui/react-dialog`; overlay `bg-black/80`, content `bg-background` with `X` close from `lucide-react`, `DialogHeader/Footer/Title/Description`).

- [ ] **Step 2: Vendor `dropdown-menu.tsx`** — canonical shadcn DropdownMenu (wraps `@radix-ui/react-dropdown-menu`; content `bg-popover text-popover-foreground`, items `focus:bg-accent`, `Check`/`Circle`/`ChevronRight` icons).

- [ ] **Step 3: Vendor `context-menu.tsx`** — canonical shadcn ContextMenu (wraps `@radix-ui/react-context-menu`; same visual language as dropdown-menu).

- [ ] **Step 4: Vendor `tooltip.tsx`** — canonical shadcn Tooltip (wraps `@radix-ui/react-tooltip`; content `bg-popover text-popover-foreground text-xs`, includes `TooltipProvider`).

- [ ] **Step 5: Vendor `popover.tsx`** — canonical shadcn Popover (wraps `@radix-ui/react-popover`; content `bg-popover text-popover-foreground`).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter desktop exec tsc -b`
Expected: clean (no unresolved imports; all Radix packages resolve).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/ui/
git commit -m "feat(ui): overlay primitives — dialog, dropdown, context-menu, tooltip, popover"
```

---

### Task 5: Feedback + input primitives — Select, Tabs, Switch, Command, Toaster

**Files:**
- Create: `apps/desktop/src/components/ui/select.tsx`, `tabs.tsx`, `switch.tsx`, `command.tsx`, `sonner.tsx`

**Interfaces:**
- Consumes: `cn`; Radix `select/tabs/switch`; `cmdk`; `sonner`; token classes; `useTheme` from `@/components/theme-provider` (for the Toaster's theme).
- Produces: `Select, SelectTrigger, SelectValue, SelectContent, SelectItem`; `Tabs, TabsList, TabsTrigger, TabsContent`; `Switch`; `Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem`; `Toaster` (+ re-export `toast` from `sonner`) — all from `@/components/ui/*`.

- [ ] **Step 1: Vendor `select.tsx`** — canonical shadcn Select (wraps `@radix-ui/react-select`; `ChevronDown`/`Check` icons; trigger `border-input`).

- [ ] **Step 2: Vendor `tabs.tsx`** — canonical shadcn Tabs (wraps `@radix-ui/react-tabs`; list `bg-muted`, active trigger `bg-background`). This is the segmented control used by the Phase-4 drawer.

- [ ] **Step 3: Vendor `switch.tsx`** — canonical shadcn Switch (wraps `@radix-ui/react-switch`; `bg-primary` when checked).

- [ ] **Step 4: Vendor `command.tsx`** — canonical shadcn Command (wraps `cmdk`; `CommandDialog` composes our `Dialog` from Task 4; `CommandInput` with `Search` icon). Primitive only — global ⌘K wiring is Phase 7.

- [ ] **Step 5: Create `sonner.tsx` (Toaster wrapper)**

Create `apps/desktop/src/components/ui/sonner.tsx`:
```tsx
import { useTheme } from "@/components/theme-provider";
import { Toaster as Sonner } from "sonner";

export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter desktop exec tsc -b`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/ui/
git commit -m "feat(ui): select, tabs, switch, command palette primitive, toaster"
```

---

### Task 6: Component gallery (dev-only review surface)

**Files:**
- Create: `apps/desktop/src/gallery/Gallery.tsx`
- Modify: `apps/desktop/src/main.tsx`

**Interfaces:**
- Consumes: every component from Tasks 3–5; `useTheme` from `@/components/theme-provider`; `toast` + `Toaster` from `@/components/ui/sonner`.
- Produces: a dev-only showcase reachable at `#gallery`; the review artifact for this phase. Mounts the global `Toaster`.

- [ ] **Step 1: Build the gallery**

Create `apps/desktop/src/gallery/Gallery.tsx`. It must render, in labeled sections, every component with its variants/states so the whole system can be reviewed at a glance:
- **Header:** an OmniBus title + a light/dark toggle using `useTheme().setTheme`, so both themes are reviewable live.
- **Buttons:** all variants (`default/secondary/ghost/destructive/outline/link`) × sizes (`default/sm/lg/icon`), plus a `disabled` and an icon+label example (lucide icon).
- **Badges:** all variants, including a status badge with a leading dot.
- **Inputs:** `Input` (with `Label`), `Textarea`, `Select` (3 options), `Switch`.
- **Cards:** a `Card` with header/title/description/content/footer.
- **Overlays:** a `Dialog` (trigger + content with header/footer + destructive confirm button), a `DropdownMenu`, a `ContextMenu` (right-click target), a `Tooltip`, a `Popover`.
- **Feedback:** `Skeleton` rows; `Kbd` chips (`⌘` `K`); `EmptyState` (lucide icon + title + description + a Button action); buttons that fire `toast.success(...)`, `toast.error(...)`, and `toast(...)`.
- **Tabs:** a `Tabs` with three panels (mimicking the future Connections/Activity/Advanced drawer).
- **Command:** a `CommandDialog` opened by a button, with a couple of `CommandItem`s.

Use only `@/components/ui/*` imports and token classes (`bg-background`, `text-foreground`, `text-muted-foreground`) — no raw `neutral-*`. Lay it out on `min-h-screen bg-background text-foreground p-8` with sections separated by generous whitespace and small `text-xs uppercase text-muted-foreground` section labels.

- [ ] **Step 2: Wire the dev-only route + mount Toaster**

Replace `apps/desktop/src/main.tsx` with:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const isGallery = import.meta.env.DEV && window.location.hash === "#gallery";

async function Root() {
  if (isGallery) {
    const { Gallery } = await import("@/gallery/Gallery");
    return <Gallery />;
  }
  return <App />;
}

function Mount() {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  React.useEffect(() => {
    Root().then(setNode);
  }, []);
  return (
    <>
      {node}
      <Toaster />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <Mount />
    </ThemeProvider>
  </React.StrictMode>
);
```
Note: the dynamic `import()` keeps `Gallery` out of the production bundle (it is only imported when `import.meta.env.DEV && #gallery`). `App` is imported statically so normal startup is unaffected.

- [ ] **Step 3: Verify build + tests**

Run: `pnpm --filter desktop build && pnpm --filter desktop test`
Expected: build PASS, tests PASS. Confirm production bundle does not include the gallery (grep the build output for gallery is optional; the `import.meta.env.DEV` guard tree-shakes it).

- [ ] **Step 4: Visual review**

Run: `pnpm --filter desktop dev`, open `http://localhost:5173/#gallery`. Verify: every component renders; the light/dark toggle flips both themes correctly; focus rings appear on Tab; overlays open/close with Escape; toasts fire; no console errors. The normal app (no hash) still shows the unchanged Projects/Debug UI.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/gallery/ apps/desktop/src/main.tsx
git commit -m "feat(ui): dev-only component gallery for design-system review"
```

---

## Self-review (against the design spec)

- **Spec coverage:** Phase 1 promised "shadcn vendored, tokens, system font, component gallery" — Tasks 1–2 deliver toolchain + tokens + font; Tasks 3–5 vendor the full component set named in the spec's Design System section (Button, Input, Textarea, Select, Dropdown, Context menu, Command palette, Dialog, Tooltip, Badge, Toast, Card, Skeleton, Empty state, Kbd, Focus ring, Segmented control via Tabs, Switch); Task 6 is the gallery. Accessibility-by-construction (focus-visible, reduced-motion, Radix keyboard semantics, AA-targeted tokens) is baked into Task 2 + the Radix wrappers. ✓
- **No behavior/API change:** no `invoke`/event/payload touched; existing screens untouched (constraint enforced per-task). ✓
- **Placeholder scan:** custom pieces (cn, tailwind config, globals, ThemeProvider, Button, Badge, Input, Textarea, Label, Card, Skeleton, Kbd, EmptyState, Toaster, main.tsx, Gallery spec) have complete code. Standard Radix wrappers (Dialog/DropdownMenu/ContextMenu/Tooltip/Popover/Select/Tabs/Switch/Command) are specified as "vendor canonical shadcn v3 verbatim" with exact path + Radix dep + token-class note — a deliberate choice: these are large, well-known external artifacts and reproducing them here verbatim adds bulk without reducing ambiguity, since the reviewer verifies them rendering in the gallery. ✓
- **Type consistency:** every component imports `cn` from `@/lib/utils`; `@/*` alias defined in Task 1 (tsconfig + vite) before any `@/` import is used; `useTheme` exported by Task 2, consumed in Task 5's Toaster and Task 6's gallery. ✓

## Definition of done (Phase 1)
- `pnpm --filter desktop build` green; `pnpm --filter desktop test` green.
- `#gallery` renders every component in both themes; focus rings, overlays (Escape), and toasts work; no console errors.
- Existing Projects/Debug UI visually and behaviorally unchanged (no hash).
- Reviewed (a UI/a11y-focused review of tokens + Button + overlays) and shown to the user before Phase 2.

## Carried to Phase 8 (accessibility audit)
- **Semantic-color contrast (must-fix):** re-tune `success`/`warning` (and audit `primary`/`destructive`) so BOTH solid (`x-foreground` on `bg-x`) AND tint (`text-x` on `bg-x/15`) usages meet WCAG AA in light and dark; introduce separate fill vs text tokens if a single value can't satisfy both. Ensure `--input` (interactive control boundary) reaches 3:1 vs background (decorative `--border` may stay subtler per WCAG 1.4.11). Token-only edit; no component changes. Origin: Task 2 opus review.
