import { Search } from "lucide-react";
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
    <header
      data-tauri-drag-region
      className="grid h-[58px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background px-4"
    >
      <div className="flex min-w-0 items-center gap-2 pl-[72px]">
        <img src={markUrl} alt="" className="size-5 shrink-0 rounded-[5px]" />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">Rabta</span>
      </div>

      <div className="flex min-w-0 justify-center">
        <Button
          variant="outline"
          className="h-8 min-w-0 max-w-[min(360px,100%)] justify-between gap-3 px-3 text-muted-foreground sm:gap-6"
          onClick={() => setCommandOpen(true)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="size-3.5 shrink-0 sm:hidden" />
            <span className="hidden truncate text-sm sm:inline">Search or jump to…</span>
          </span>
          <Kbd className="shrink-0">⌘K</Kbd>
        </Button>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={
                  connectedCount > 0
                    ? "size-1.5 shrink-0 rounded-full bg-success"
                    : "size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                }
              />
              <span className="truncate">{connectedCount} connected</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">hub 127.0.0.1:{hubPort ?? "…"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
