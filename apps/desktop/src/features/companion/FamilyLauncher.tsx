import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { RabtaIcon } from "@/vendor/rabta-ui/icons";
import { toastErr } from "@/lib/toast";
import { useStore } from "@/store";
import { FamilyEmblem } from "@/components/brand/FamilyEmblem";
export function FamilyLauncher() {
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  async function open() {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      await invoke("open_companion");
    } catch (e) {
      toastErr(e);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="family-launcher"
        aria-label="Rabta products"
      >
        <RabtaIcon name="layers" />
        <span>Rabta</span>
        <RabtaIcon name="chevrondown" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="family-menu">
        <DropdownMenuLabel>One family. Your flow.</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => useStore.getState().setView("overview")}
        >
          <FamilyEmblem product="workspace" size={24} />
          <span>
            Workspace<small>Your tasks and tools, together</small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={opening} onSelect={() => void open()}>
          <FamilyEmblem product="companion" size={24} />
          <span>
            Companion
            <small>
              {opening ? "Opening…" : "Keep your current task in reach"}
            </small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useStore.getState().setView("capsules")}
        >
          <FamilyEmblem product="connect" size={24} />
          <span>
            Connect<small>Review a capsule → Use context</small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useStore.getState().setView("capsules")}
        >
          <FamilyEmblem product="teams" size={24} />
          <span>
            Teams<small>Prepare a handoff from a capsule</small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            void invoke("open_url", {
              url: "https://rabta-studio.n0bodyy.chatgpt.site",
            }).catch(toastErr)
          }
        >
          <FamilyEmblem product="studio" size={24} />
          <span>
            Studio<small>Design library & motion ↗</small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useStore.getState().setView("utilities")}
        >
          <RabtaIcon name="wrench" />
          <span>
            Utilities<small>Local tools & Mac controls</small>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
