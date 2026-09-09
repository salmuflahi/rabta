import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "@/vendor/rabta-ui/glyphs";
import { FamilyEmblem } from "@/components/brand/FamilyEmblem";
import { RabtaIcon } from "@/vendor/rabta-ui/icons";
import type { Project, Task, TaskResource } from "@/store";
import { buildContext, CONTEXT_PARTS, type ContextPart } from "./context";
export function ContextHandoff({
  task,
  project,
  resources,
  compact = false,
}: {
  task: Task;
  project?: Project;
  resources: TaskResource[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [note, setNote] = useState(""),
    [parts, setParts] = useState<ContextPart[]>([
      "files",
      "tabs",
      "terminals",
      "git",
    ]),
    [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
      "idle",
    );
  const pending = useRef(false),
    preview = useRef<HTMLTextAreaElement>(null);
  const content = useMemo(
    () => buildContext(task, project, resources, parts, note),
    [task, project, resources, parts, note],
  );
  const version = useRef(0);
  useEffect(() => {
    version.current++;
  }, [content, open]);
  async function copy() {
    if (pending.current) return;
    const started = version.current;
    pending.current = true;
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(content);
      if (version.current === started) setStatus("copied");
    } catch {
      if (version.current !== started) return;
      setStatus("error");
      preview.current?.focus();
      preview.current?.select();
    } finally {
      pending.current = false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setStatus("idle");
      }}
    >
      <DialogTrigger
        className={buttonVariants({
          variant: "outline",
          className: compact ? "companion-handoff" : "",
        })}
      >
        <RabtaIcon name="link" />
        Use context
      </DialogTrigger>
      <DialogContent className="context-handoff">
        <DialogHeader>
          <span className="family-eyebrow context-identity">
            <FamilyEmblem product="connect" size={26} /> Rabta Connect{" "}
            <span aria-hidden>·</span>
            <FamilyEmblem product="teams" size={26} /> Teams
          </span>
          <DialogTitle>Start with the whole picture.</DialogTitle>
          <DialogDescription>
            Bring this task into your AI conversation, or hand it to a teammate.
            Review exactly what you’ll copy.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="context-parts">
          <legend className="sr-only">Include in this brief</legend>
          {CONTEXT_PARTS.map(({ id, label }) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={parts.includes(id)}
                onChange={(e) => {
                  setParts((old) =>
                    e.target.checked
                      ? [...old, id]
                      : old.filter((p) => p !== id),
                  );
                  setStatus("idle");
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="context-note">
          What should happen next?
          <Textarea
            className="context-note-input resize-none"
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value);
              setStatus("idle");
            }}
            placeholder="e.g. Help me debug the reconnect issue, then suggest a fix."
            rows={2}
          />
        </label>
        <label className="context-note">
          Your brief
          <Textarea
            className="context-preview resize-none"
            ref={preview}
            readOnly
            value={content}
            rows={9}
          />
        </label>
        <div className="context-footer">
          <p role="status">
            {status === "copied"
              ? "Copied. Paste it into your AI chat or team conversation."
              : status === "error"
                ? "Clipboard unavailable. The brief is selected; press ⌘C or Ctrl+C."
                : "Nothing is sent automatically. You choose where it goes."}
          </p>
          <Button
            variant="primary"
            onClick={() => void copy()}
            disabled={status === "copying"}
          >
            {status === "copying" ? (
              <Loader2 className="animate-spin" />
            ) : status === "copied" ? (
              <Check />
            ) : (
              <Copy />
            )}
            {status === "copied" ? "Copied" : "Copy brief"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
