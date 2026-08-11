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
 * One row inside a grouped `Surface` — and, since Task 11 (Console v2 Phase
 * 4), one option in any of the four master lists too.
 *
 * Siblings are separated by a hairline drawn on the row's own top edge, with
 * `first:border-t-0` keeping a stray line off the top of the surface. That is
 * the whole separation model — no boxes, no dividers as elements.
 *
 * `forwardRef`, deliberately, not a plain function component: Task 11 spreads
 * `useListNavigation`'s `getItemProps(item, index)` — which includes a
 * callback `ref` — straight onto a `<Row>` for each master-list row. Task
 * 10's implementer proved empirically (React 18.3.1) that a bare `ref` handed
 * to a plain function component is silently dropped — React logs its own
 * forwardRef warning and the callback never fires. Left unfixed, the hook's
 * keyboard-driven `el.focus()` / `el.scrollIntoView()` would have quietly
 * done nothing: no thrown error, no failing test, just a focus ring and a
 * scroll that never happen. Verified fixed here by confirming (in the
 * browser, against a real page) that ArrowDown actually moves DOM focus onto
 * the next `<Row>` — see task-11-report.md.
 */
export const Row = React.forwardRef<HTMLDivElement, RowProps>(function Row(
  { leading, title, subtitle, trailing, className, ...props },
  ref,
) {
  // Press feedback is gated on role="option" — the one case where the row
  // itself, not some control nested inside it, is the click target. The four
  // master lists (Capsules, Projects, Connectors, Activity — wired in Task
  // 11) render every row with role="option" for exactly this reason. The
  // older call sites (CapsuleItems, RestoreExperience) nest their own
  // interactive children — a pin button, a link — inside an otherwise inert
  // row; scaling the whole row down on every press of a child button would
  // read as the row reacting to a click it had no part in.
  const interactive = props.role === "option";
  return (
    <div
      ref={ref}
      data-row
      className={cn(
        "flex items-center gap-2.5 border-t border-border/60 px-3 py-2 first:border-t-0",
        interactive && "active:scale-[0.995] transition-transform duration-fast ease-standard",
        // A focusable row (role="option", the master lists' roving tabIndex)
        // otherwise has no visible sign it holds keyboard focus at all — the
        // ring only ever paints under :focus-visible, so it costs nothing on
        // Row's other, non-focusable call sites.
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
