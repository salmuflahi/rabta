import markUrl from "@/assets/brand/rabta-mark.svg";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/store";

export function Titlebar() {
  const connectors = useStore((s) => s.connectors);
  const hubPort = useStore((s) => s.hubPort);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <header className="grid h-[58px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <img src={markUrl} alt="" className="size-5 rounded-[5px]" />
        <span className="text-sm font-semibold tracking-tight text-foreground">Rabta</span>
      </div>

      <Button
        variant="outline"
        className="h-8 justify-between gap-6 px-3 text-muted-foreground"
        onClick={() => setCommandOpen(true)}
      >
        <span className="text-sm">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </Button>

      <div className="flex items-center justify-end gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={
                  connectedCount > 0 ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground/40"
                }
              />
              {connectedCount} connected
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">hub 127.0.0.1:{hubPort ?? "…"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
