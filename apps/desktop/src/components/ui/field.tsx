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
      data-testid="field-root"
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
