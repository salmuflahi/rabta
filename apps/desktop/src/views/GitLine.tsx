import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  GitCommitVertical,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toastErr, toastOk } from "@/lib/toast";
import { useStore } from "../store";

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

export function GitLine({
  projectId,
  onChanged,
}: {
  projectId: string;
  /** Fired after any successful git mutation (fetch/checkout/create-branch)
   * once this component's own status has been refreshed — lets a parent
   * (e.g. ProjectsPage's UnsavedChangesDot) refetch its own independent
   * git_status without remounting this component. Not called on failure. */
  onChanged?: () => void;
}) {
  const activationNonce = useStore((s) => s.activationNonce);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await invoke<GitStatus>("git_status", { projectId }));
      setBranches(await invoke<string[]>("git_branches", { projectId }));
    } catch (e) {
      console.error("git status refresh failed:", e);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  // A task activation elsewhere may have git-first restored a capsule,
  // switching this project's branch out from under it — refetch (without
  // remounting, so any in-flight local state here survives) whenever the
  // global activation nonce bumps.
  useEffect(() => {
    refresh();
  }, [activationNonce]);

  async function run(
    command: string,
    args: Record<string, unknown>,
    okMessage: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      await invoke(command, { projectId, ...args });
      toastOk(okMessage);
      await refresh();
      onChanged?.();
      return true;
    } catch (e) {
      toastErr(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createBranch() {
    if (!newBranch) return;
    const ok = await run("git_create_branch", { name: newBranch }, `Created ${newBranch}`);
    if (ok) {
      setNewBranch("");
      setNewBranchOpen(false);
    }
  }

  const s = status;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs">
      {s ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex min-w-0 max-w-full cursor-default items-center gap-1.5">
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className={
                    s.dirty
                      ? "min-w-0 truncate font-mono text-warning"
                      : "min-w-0 truncate font-mono text-foreground"
                  }
                >
                  {s.branch ?? "detached"}
                </span>
                <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Rabta never force-pushes, resets, or discards your work.
            </TooltipContent>
          </Tooltip>

          {s.changedCount > 0 && (
            <Badge variant={s.dirty ? "warning" : "secondary"}>
              <GitCommitVertical className="size-3" />
              {s.changedCount} changed
            </Badge>
          )}
          {s.ahead > 0 && (
            <Badge variant="secondary">
              <ArrowUp className="size-3" />
              {s.ahead}
            </Badge>
          )}
          {s.behind > 0 && (
            <Badge variant="secondary">
              <ArrowDown className="size-3" />
              {s.behind}
            </Badge>
          )}
        </>
      ) : (
        <span className="text-muted-foreground/70">Loading git status…</span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy || !s} className="h-6 gap-1 px-2 text-xs">
            <MoreHorizontal className="size-3.5" />
            Git
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem disabled={busy} onSelect={() => run("git_fetch", {}, "Fetched")}>
            <RefreshCw className="mr-2 size-3.5" />
            Fetch
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={busy || branches.length === 0}>
              <GitBranch className="mr-2 size-3.5" />
              Switch Branch
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {branches.map((b) => (
                <DropdownMenuItem
                  key={b}
                  disabled={busy || b === s?.branch}
                  onSelect={() => run("git_checkout", { branch: b }, `Switched to ${b}`)}
                >
                  {b === s?.branch ? (
                    <Check className="mr-2 size-3.5" />
                  ) : (
                    <span className="mr-2 size-3.5" />
                  )}
                  <span className="font-mono">{b}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              setNewBranchOpen(true);
            }}
          >
            <Plus className="mr-2 size-3.5" />
            New Branch…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Branch</DialogTitle>
            <DialogDescription>Create a new branch from the current one.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-branch-name">Branch Name</Label>
            <Input
              id="new-branch-name"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="feature/my-change"
              className="font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewBranchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createBranch} disabled={busy || !newBranch}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
