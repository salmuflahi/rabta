import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

interface StartedTask {
  branch: string;
  branchNote: string;
}

export function GitHubSection({ projectId, onStarted }: { projectId: string; onStarted: () => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<boolean>("github_available").then(setAvailable).catch(() => setAvailable(false));
  }, []);

  async function fetchIssues() {
    setBusy(true);
    setNote("");
    try {
      setIssues(await invoke<Issue[]>("github_issues", { projectId }));
    } catch (e) {
      setNote(String(e));
      setIssues(null);
    } finally {
      setBusy(false);
    }
  }

  async function start(issue: Issue) {
    setBusy(true);
    setNote("");
    try {
      const s = await invoke<StartedTask>("start_issue_task", {
        projectId,
        number: issue.number,
        title: issue.title,
      });
      setNote(s.branchNote);
      onStarted();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (available === false) {
    return (
      <div className="mt-2 text-xs text-muted-foreground">
        GitHub: install the <code className="font-mono">gh</code> CLI and run{" "}
        <code className="font-mono">gh auth login</code> to fetch issues
      </div>
    );
  }

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={fetchIssues}
        disabled={busy}
        className="rounded border border-input px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40"
      >
        Fetch Issues
      </button>
      {note && <span className="ml-2 break-all text-muted-foreground">{note}</span>}
      {issues?.length === 0 && <div className="mt-1 text-muted-foreground">No open issues</div>}
      {issues?.map((i) => (
        <div key={i.number} className="mt-1 flex items-center gap-2">
          <span className="flex-1 text-foreground">
            #{i.number} {i.title}
            {i.labels.length > 0 && <span className="text-muted-foreground"> · {i.labels.join(", ")}</span>}
          </span>
          <button
            onClick={() => start(i)}
            disabled={busy}
            className="rounded border border-input px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40"
          >
            Start Task
          </button>
        </div>
      ))}
    </div>
  );
}
