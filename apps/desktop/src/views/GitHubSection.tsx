import { invoke } from "@tauri-apps/api/core";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!issues) return null;
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(
      (i) => i.title.toLowerCase().includes(q) || String(i.number).includes(q)
    );
  }, [issues, query]);

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
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={fetchIssues} disabled={busy}>
          {busy && !issues ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Sync GitHub
        </Button>
        {issues && issues.length > 5 ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter issues…"
              className="h-8 pl-8 text-meta"
            />
          </div>
        ) : null}
        {note && <span className="break-all text-meta text-muted-foreground">{note}</span>}
      </div>

      {issues?.length === 0 && (
        <p className="mt-2 text-meta text-muted-foreground">No open issues.</p>
      )}

      {filtered && filtered.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border/70">
          {filtered.map((i) => (
            <div
              key={i.number}
              className="group flex items-center gap-2 border-b border-border/50 px-2.5 py-1.5 transition-colors last:border-b-0 hover:bg-accent/50"
            >
              <span className="shrink-0 font-mono text-label text-muted-foreground">
                #{i.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-meta text-foreground">{i.title}</span>
              {i.labels.slice(0, 2).map((label) => (
                <span
                  key={label}
                  className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-label text-muted-foreground sm:inline"
                >
                  {label}
                </span>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-label opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => start(i)}
                disabled={busy}
              >
                Start task
              </Button>
            </div>
          ))}
        </div>
      )}
      {issues && filtered && filtered.length === 0 && query && (
        <p className="mt-2 text-meta text-muted-foreground">No issues match “{query}”.</p>
      )}
    </div>
  );
}
