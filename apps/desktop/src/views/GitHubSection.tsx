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
      <div className="mt-1 text-xs text-neutral-600">
        GitHub: install the <code>gh</code> CLI and run <code>gh auth login</code> to fetch issues
      </div>
    );
  }

  return (
    <div className="mt-1 text-xs">
      <button onClick={fetchIssues} disabled={busy} className="bg-neutral-800 px-2 disabled:opacity-40">
        fetch issues
      </button>
      {note && <span className="ml-2 text-neutral-400 break-all">{note}</span>}
      {issues?.length === 0 && <div className="text-neutral-600 mt-1">no open issues</div>}
      {issues?.map((i) => (
        <div key={i.number} className="flex items-center gap-2 mt-1">
          <span className="flex-1">
            #{i.number} {i.title}
            {i.labels.length > 0 && <span className="text-neutral-500"> · {i.labels.join(", ")}</span>}
          </span>
          <button onClick={() => start(i)} disabled={busy} className="bg-neutral-700 px-2 disabled:opacity-40">
            start task
          </button>
        </div>
      ))}
    </div>
  );
}
