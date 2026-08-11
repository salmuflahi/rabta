import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** Step counter shown at the left of the footer, e.g. `{ current: 2, total: 4 }`. */
  step?: { current: number; total: number };
  /** Back button. Omitted on the first step. */
  onBack?: () => void;
  /** The one accent action. `null` renders no primary at all. */
  primary?: { label: string; onClick: () => void; disabled?: boolean } | null;
  /** A third footer button between Cancel and the primary. `tone: "bad"`
   * colours it as a destructive/negative choice (Deny, Disconnect).
   * `disabled` exists because the pairing sheet holds *both* decisions
   * inert while it arms — not just the affirmative one. */
  secondary?: { label: string; onClick: () => void; tone?: "bad"; disabled?: boolean } | null;
  /** Whether Enter fires the primary action. Default `true`, per the
   * handoff's "enter advances".
   *
   * The pairing sheet sets this `false`: approving a connector is a security
   * decision, and an Enter keypress already in flight when the sheet appears
   * must not be able to make it. With this off, Enter is still swallowed —
   * no global shortcut fires — it simply does nothing. */
  enterAdvances?: boolean;
  cancelLabel?: string;
  children: React.ReactNode;
}

/**
 * A macOS sheet — the Migrate flow's container, per the design handoff:
 * 620px wide, max 84vh, sliding down from under the titlebar
 * (`translateY(-101%) → 0`, 300ms `cubic-bezier(.32,.72,0,1)`), rounded
 * only at the bottom, over a scrim. Header, scrolling body, and a footer
 * carrying a step counter on the left and Cancel / Back / primary on the
 * right.
 *
 * **It swallows the keyboard.** The handoff: "When the Migrate sheet is
 * open it swallows all keys — esc closes, enter advances, nothing else
 * fires." That matters because this app has global ⌘K / ⌘1–5 / ⌘N / ⌘S /
 * ⌘R / ⌘\ shortcuts bound on `window` (App.tsx), and every one of them
 * would otherwise navigate the window out from under a half-finished
 * migration — including ⌘S, which would capture a capsule mid-transfer.
 *
 * The swallow is a capture-phase listener on `document`: capture runs
 * outermost-in, and App's listener is a bubble-phase one on `window`, so
 * stopping propagation here reaches it before it ever runs. Radix's own
 * Escape handling is left alone — it already closes the dialog.
 *
 * Enter forwards to the primary action, but only when focus isn't on a
 * control that owns the key itself: a focused button, link or textarea
 * handles its own Enter, and firing both would be two actions from one
 * keypress. That rule only works because initial focus is moved off the
 * footer — Radix otherwise focuses the first tabbable element, which is
 * Cancel, so the handoff's "enter advances" would have *cancelled* the
 * migration on the very first keypress.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  step,
  onBack,
  primary,
  secondary,
  enterAdvances = true,
  cancelLabel = "Cancel",
  children,
}: SheetProps) {
  // Held in a ref so the listener below never needs re-registering when the
  // step changes — re-registering on every render would drop keystrokes in
  // the window between removeEventListener and addEventListener.
  const primaryRef = React.useRef(primary);
  primaryRef.current = primary;
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      // Escape belongs to Radix, which closes the sheet. Let it through
      // untouched rather than reimplementing close here.
      if (event.key === "Escape") return;

      if (event.key === "Enter") {
        // A focused button, link or textarea owns Enter — advancing the
        // sheet *and* activating the control would fire two things from
        // one keypress.
        const el = document.activeElement;
        const ownsEnter =
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLButtonElement ||
          el instanceof HTMLAnchorElement;
        if (enterAdvances && !ownsEnter) {
          const action = primaryRef.current;
          if (action && !action.disabled) {
            event.preventDefault();
            action.onClick();
          }
        }
        event.stopPropagation();
        return;
      }

      // Everything else: typing still reaches the focused field (no
      // preventDefault), but no global shortcut fires.
      event.stopPropagation();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, enterAdvances]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-140 data-[state=closed]:duration-100" />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          // Radix focuses the first tabbable descendant on open; here that
          // is the Cancel button. Focus the sheet itself instead, so Enter
          // advances (per the handoff) rather than cancelling, and so a
          // screen reader starts at the sheet's title rather than mid-footer.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          data-sheet
          className={cn(
            // Anchored to the top edge and rounded only at the bottom: it is
            // a sheet coming out from under the titlebar, not a floating
            // card that happens to be near the top.
            "fixed left-1/2 top-0 z-50 flex w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col",
            "max-h-[84vh] overflow-hidden rounded-b-[12px] bg-background shadow-modal",
            "duration-300 ease-mac data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full",
          )}
        >
          <div className="shrink-0 px-6 pb-4 pt-5">
            <DialogPrimitive.Title className="text-sheet font-640 text-foreground">
              {title}
            </DialogPrimitive.Title>
            {subtitle && (
              <DialogPrimitive.Description className="mt-1 text-sub text-muted-foreground">
                {subtitle}
              </DialogPrimitive.Description>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>

          <div className="flex shrink-0 items-center gap-2 border-t-[0.5px] border-border px-6 py-3.5">
            {step && (
              <span className="text-meta tabular-nums text-tertiary-foreground">
                Step {step.current} of {step.total}
              </span>
            )}
            <div className="flex-1" />
            <Button
              variant="secondary"
              size="sm"
              className="h-7 rounded-[7px] px-3 text-body"
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 rounded-[7px] px-3 text-body"
                onClick={onBack}
              >
                Back
              </Button>
            )}
            {secondary && (
              <Button
                variant="secondary"
                size="sm"
                className={cn(
                  "h-7 rounded-[7px] px-3 text-body",
                  secondary.tone === "bad" && "text-bad hover:text-bad",
                )}
                disabled={secondary.disabled}
                onClick={secondary.onClick}
              >
                {secondary.label}
              </Button>
            )}
            {primary && (
              <Button
                variant="primary"
                size="sm"
                className="h-7 rounded-[7px] px-3.5 text-body font-510"
                disabled={primary.disabled}
                onClick={primary.onClick}
              >
                {primary.label}
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
