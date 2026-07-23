import markUrl from "@/assets/brand/rabta-mark.svg";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";

function NavRow({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[38px] w-full items-center gap-2.5 rounded-[8px] px-2.5 text-sm transition-[background-color,color] duration-150 ease-brand active:scale-[0.99]",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      <Kbd className="border-sidebar-foreground/20 bg-transparent text-sidebar-foreground/50">
        {item.shortcut}
      </Kbd>
    </button>
  );
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const go = (key: NavKey) => setView(key);

  return (
    <aside className="flex h-full flex-col bg-sidebar px-[13px] py-[18px] text-sidebar-foreground">
      <div className="mb-6 flex items-center gap-2 px-2.5">
        <img src={markUrl} alt="" className="size-6 rounded-[6px]" />
        <span className="text-sm font-semibold tracking-tight">Rabta</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.key} item={item} active={view === item.key} onClick={() => go(item.key)} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-2">
        <NavRow
          item={SETTINGS_ITEM}
          active={view === SETTINGS_ITEM.key}
          onClick={() => go(SETTINGS_ITEM.key)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs text-sidebar-foreground/60">
              <span className="size-1.5 rounded-full bg-success" />
              Local only
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            Runs entirely on 127.0.0.1 — no cloud account, no telemetry.
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
