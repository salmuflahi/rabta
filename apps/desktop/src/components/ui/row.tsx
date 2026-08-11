import * as React from "react";
import { cn } from "@/lib/utils";

// `title` is redeclared below as ReactNode (JSX content, not the native HTML
// tooltip string), so the native `title?: string` attribute is omitted here
// to avoid a conflicting override. Do not "fix" this back to string.
export interface RowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
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
 *
 * Today's two call sites are `CapsuleItems`' pin rows and
 * `RestoreExperience`'s "kept" list. Both nest their own interactive
 * children — a pin button, a link — inside an otherwise inert row, and
 * neither passes `role="option"`.
 *
 * `forwardRef` and the focus-visible ring in the class list below are not
 * exercised by either of those, and are kept anyway, deliberately, for a
 * future consumer where the row itself — not a child control — is the click
 * target (a listbox-style picker):
 *
 * - `forwardRef`: Task 11 (Console v2 Phase 4) briefly wired all four master
 *   lists through `Row`, spreading `useListNavigation`'s
 *   `getItemProps(item, index)` — which includes a callback `ref` — straight
 *   onto it. That wiring was reviewed and reverted (the four lists went back
 *   to their original, shipped `<button>` markup — see task-11-report.md's
 *   addendum), so nothing currently spreads a `ref` onto `Row`. The
 *   `forwardRef` conversion itself stayed: on React 18.3.1 a bare `ref`
 *   handed to a plain function component is silently dropped (React logs
 *   its own warning; the callback never fires), so the moment some future
 *   caller — inside this codebase or the next feature that reaches for
 *   `Row` — spreads a `ref`-bearing props object onto it the same way,
 *   it needs to already work. Matches the `Input`/`Surface` pattern already
 *   used elsewhere here, and costs nothing to carry.
 * - The focus-visible ring only ever paints under `:focus-visible`, which
 *   nothing currently targets (neither call site's row is keyboard-
 *   focusable) — so it's inert today, not decorative-but-wrong. It's there
 *   so a future focusable row gets a visible focus indicator for free
 *   instead of silently having none.
 */
export const Row = React.forwardRef<HTMLDivElement, RowProps>(function Row(
  { leading, title, subtitle, trailing, className, ...props },
  ref,
) {
  // Press feedback is gated on role="option" — the one case where the row
  // itself, not some control nested inside it, would be the click target.
  // Nothing today sets role="option" on a Row (see the module comment above
  // for why: the four master lists that briefly did were reverted to their
  // own bespoke markup). This stays inert scaffolding for that same future
  // consumer — removing it changes no rendered output today, and the reason
  // NOT to remove it is the same as the reason not to remove `forwardRef`.
  const interactive = props.role === "option";
  return (
    <div
      ref={ref}
      data-row
      className={cn(
        "flex items-center gap-2.5 border-t border-border/60 px-3 py-2 first:border-t-0",
        interactive && "active:scale-[0.995] transition-transform duration-fast ease-standard",
        // For a future focusable, role="option" row (see the module comment
        // above) — without it, keyboard focus would have no visible sign at
        // all. Paints only under :focus-visible, so it costs nothing on
        // Row's current, non-focusable call sites.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
});
Row.displayName = "Row";
