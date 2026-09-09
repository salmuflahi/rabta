import { FamilyEmblem } from "@/components/brand/FamilyEmblem";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { RabtaIcon } from "@/vendor/rabta-ui/icons";
import { ContextMeasure } from "@/components/ContextMeasure";
import { ApprovedWordmark } from "@/components/brand/ApprovedWordmark";
import { ContextHandoff } from "@/features/handoff/ContextHandoff";
import { capsuleChips, capsuleSavedAt } from "@/lib/capsuleFacts";
import { relativeTime } from "@/lib/humanize";
import type { Project, Task, TaskResource } from "@/store";
interface Snapshot {
  task: Task | null;
  project?: Project;
  resources: TaskResource[];
}
export function Companion() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const generation = useRef(0),
    action = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const [taskId, projects] = await Promise.all([
        invoke<string | null>("active_task"),
        invoke<Project[]>("list_projects"),
      ]);
      let next: Snapshot = { task: null, resources: [] };
      if (taskId) {
        const lists = await Promise.all(
          projects.map((p) =>
            invoke<Task[]>("list_tasks", { projectId: p.id }),
          ),
        );
        const task = lists.flat().find((t) => t.id === taskId);
        if (task)
          next = {
            task,
            project: projects.find((p) => p.id === task.projectId),
            resources: await invoke<TaskResource[]>("task_resources", {
              taskId,
            }),
          };
      }
      if (id === generation.current) {
        setData(next);
        setError("");
      }
    } catch {
      if (id === generation.current)
        setError("Couldn’t load your current task.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    let stopped = false;
    const sub = listen("hub-event", () => void refresh());
    sub
      .then((off) => {
        if (stopped) off();
      })
      .catch(() => {});
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      stopped = true;
      generation.current++;
      sub.then((off) => off()).catch(() => {});
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function capture() {
    if (!data?.task || action.current) return;
    action.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const result = await invoke<{ captured: string[]; skipped: string[] }>(
        "save_capsule",
        { taskId: data.task.id },
      );
      setFeedback(
        result.captured.length
          ? `Saved ${result.captured.join(", ")}. ${result.skipped.length ? "Some tools were unavailable." : ""}`
          : "Nothing connected to capture. Open Workspace to connect your tools.",
      );
      await refresh();
    } catch {
      setFeedback(
        "Capture didn’t finish. Your saved state is still here. Try again.",
      );
    } finally {
      action.current = false;
      setBusy(false);
    }
  }
  async function workspace() {
    try {
      await invoke("show_workspace", { taskId: data?.task?.id ?? null });
    } catch {
      setFeedback("Couldn’t open Workspace. Try again.");
    }
  }
  const saved = data ? capsuleSavedAt(data.resources) : null;
  return (
    <main className="companion-window">
      <header data-tauri-drag-region>
        <span className="companion-brand">
          <ApprovedWordmark className="approved-wordmark" />
          <span>[companion]</span>
        </span>
        <button
          type="button"
          aria-label="Hide Companion"
          onClick={() =>
            void invoke("hide_companion").catch(() =>
              setFeedback("Couldn’t hide Companion. Try again."),
            )
          }
        >
          <RabtaIcon name="minus" />
        </button>
      </header>
      <div className="companion-body">
        {error ? (
          <div className="companion-empty">
            <p role="alert">{error}</p>
            <Button onClick={() => void refresh()}>Try again</Button>
          </div>
        ) : !data ? (
          <p role="status">Finding your current task…</p>
        ) : !data.task ? (
          <div className="companion-empty">
            <RabtaIcon name="capsule" size={40} />
            <h1>A little space for your focus.</h1>
            <p>
              Open a capsule in Workspace. Your current task will stay within
              reach here.
            </p>
            <Button variant="primary" onClick={() => void workspace()}>
              Open Workspace
            </Button>
          </div>
        ) : (
          <>
            <div className="companion-current">
              <span className="family-eyebrow context-identity">
                <FamilyEmblem product="companion" size={24} />
                Your current focus
              </span>
              <span className="companion-saved">
                {saved ? `Saved ${relativeTime(saved)}` : "Ready to capture"}
              </span>
            </div>
            <h1>{data.task.title}</h1>
            <p className="companion-project">{data.project?.name}</p>
            <ContextMeasure
              compact
              items={capsuleChips(data.resources)
                .filter((c) => c.key !== "folders")
                .map((c) => ({ id: c.key, label: c.label, count: c.count }))}
            />
            <div className="companion-actions">
              <Button
                variant="primary"
                onClick={() => void capture()}
                disabled={busy}
              >
                <RabtaIcon name="capture" />
                {busy ? "Capturing…" : "Capture context"}
              </Button>
              <ContextHandoff
                task={data.task}
                project={data.project}
                resources={data.resources}
                compact
              />
            </div>
            <button
              className="companion-return"
              type="button"
              onClick={() => void workspace()}
            >
              Open in Workspace <RabtaIcon name="arrow" />
            </button>
          </>
        )}
        <p className="companion-feedback" role="status">
          {feedback}
        </p>
      </div>
      <footer>
        <RabtaIcon name="shield" />
        On your Mac. In your control.
      </footer>
    </main>
  );
}
