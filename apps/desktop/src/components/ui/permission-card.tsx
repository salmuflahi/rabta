import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * One of a pair of permission columns — "Can see" in green with checks,
 * "Never sees" in red with crosses.
 *
 * Shared between the Connectors detail page (shown after a connector is
 * already approved) and the pairing approval sheet (shown while deciding
 * whether to approve one). Both read the same `canSee`/`neverSees` facts
 * from `@/lib/connectorFacts`, and — since this component moved here from
 * ConnectorsPage.tsx, which had the only copy — both now render them
 * identically. That match matters beyond DRY: what a user is asked to
 * consent to and what they can later inspect are the same claim, and two
 * different-looking cards for that one claim would quietly undercut the
 * trust this pair exists to build.
 */
export function PermissionCard({
  heading,
  tone,
  glyph,
  lines,
}: {
  heading: string;
  tone: "ok" | "bad";
  glyph: IconName;
  lines: string[];
}) {
  return (
    <div className="rounded-[10px] bg-card p-[15px] shadow-raised">
      <p className={cn("mb-2 text-sub font-semibold", tone === "ok" ? "text-ok" : "text-bad")}>
        {heading}
      </p>
      {lines.map((line) => (
        <div key={line} className="flex items-center gap-2 py-1 text-sub text-foreground">
          <Icon
            name={glyph}
            className={cn("size-[13px] shrink-0", tone === "ok" ? "text-ok" : "text-bad")}
          />
          {line}
        </div>
      ))}
    </div>
  );
}
