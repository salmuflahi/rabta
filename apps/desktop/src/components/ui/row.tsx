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
