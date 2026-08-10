import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore } from "@/store";

export interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

/**
 * A project's working-tree state, refetched whenever the project changes,
 * a task is activated (`activationNonce`), or the caller bumps
 * `refreshKey` after a git mutation of its own.
 *
 * Extracted from ProjectCard's `UnsavedChangesDot` when Phase 2 rebuilt
 * Projects as master/detail: both the master list's dirty dot and the
 * detail pane's branch / git-state chips need this, and two independent
 * copies of the fetch would be two chances to disagree about whether the
 * tree is clean.
 *
 * Returns null until the first fetch lands, and stays null if it fails —
 * callers render nothing rather than guessing at a state. A failed
 * `git_status` is not "clean".
 */
export function useGitStatus(projectId: string | undefined, refreshKey = 0): GitStatus | null {
  const activationNonce = useStore((s) => s.activationNonce);
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!projectId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setStatus(null);
    invoke<GitStatus>("git_status", { projectId })
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((error) => console.error("git status refresh failed:", error));
    return () => {
      cancelled = true;
    };
  }, [projectId, activationNonce, refreshKey]);

  return status;
}
