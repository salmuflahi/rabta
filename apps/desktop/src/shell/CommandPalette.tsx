import { FolderGit2, Layers } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";

/** Global ⌘K palette: jump to any nav section, or trigger the two most
 * common cross-page actions (both just land on the page that owns the
 * real flow — no new invokes here). Mounted once at the shell level;
 * App.tsx's keydown listener and the Titlebar trigger both just flip the
 * store's `commandOpen` boolean that this dialog is bound to. */
export function CommandPalette() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const setView = useStore((s) => s.setView);

  const go = (key: NavKey) => {
    setView(key);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.key} onSelect={() => go(item.key)}>
                <Icon />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("projects")}>
            <FolderGit2 />
            <span>Register Project</span>
          </CommandItem>
          <CommandItem onSelect={() => go("capsules")}>
            <Layers />
            <span>New Task</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
