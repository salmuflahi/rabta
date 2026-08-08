import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";

/**
 * Shown when an initial data fetch FAILS — distinct from a genuinely empty
 * workspace. Critical for a local-first app: a read error must never be
 * rendered as "you have nothing" (which reads as data loss and invites
 * re-registering duplicates). Reassures that data is safe and offers a retry.
 */
export function LoadError({
  onRetry,
  entity = "your workspace",
}: {
  onRetry: () => void;
  entity?: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 border border-dashed p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-card font-semibold text-foreground">Couldn't load {entity}</p>
        <p className="mx-auto max-w-md text-meta leading-relaxed text-muted-foreground">
          Something went wrong reading your local data. Nothing is lost — your capsules and projects
          are safe on disk. Try again in a moment.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}
