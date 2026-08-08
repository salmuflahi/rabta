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
