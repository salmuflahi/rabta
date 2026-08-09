import { cn } from "@/lib/utils";

/**
 * A keyboard-shortcut chip — used inline (Toolbar's ⌘K hint, the palette's
 * footer glyphs) and in Settings' Keyboard shortcuts list. Confirmed against
 * the prototype's own shortcut-row kbd (`Rabta - Console v2.dc.html`, ~line
 * 528), which the README's prose only approximates:
 * `height:20px;min-width:20px;border-radius:5px;background:var(--secondary);
 * padding:0 7px;font-family:ui-monospace,'SF Mono',Menlo,monospace;
 * font-size:11px;color:var(--text2)` — no border; the chip's edge is its
 * background fill against `--secondary`, not a drawn outline. `--secondary`
 * maps 1:1 to this codebase's `--secondary`, and `--text2` maps to
 * `--muted-foreground` (see tokens.test.ts).
 *
 * Presentational, not interactive: a bare `<kbd>` carries no implicit ARIA
 * role or tab stop, so nothing here needs to suppress either.
 */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-secondary px-[7px] font-mono text-[11px] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
