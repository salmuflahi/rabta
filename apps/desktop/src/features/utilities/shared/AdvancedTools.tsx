"use client";
import { useEffect, useRef, useState } from "react";
import {
  calendarExport,
  diffLines,
  parsePlan,
  parseTimestamp,
  quizOptions,
  studyCards,
  validatePost,
  validTimezone,
  type DiffLine,
  type PlannedPost,
  type StudyCard,
} from "./advanced-core";
import {
  useFileExport,
  InputField,
  message,
  Output,
  SelectField,
  Status,
  TextField,
  useUI,
} from "./controls";
import type { ToolId } from "./catalog";

function TextDiff() {
  const { exportFile, exporting, exportFeedback } = useFileExport();
  const { Button } = useUI();
  const [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [result, setResult] = useState<DiffLine[] | null>(null),
    [error, setError] = useState("");
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setResult(null);
    setError("");
  };
  return (
    <>
      <div className="rk-columns">
        <TextField
          label="Before"
          value={before}
          maxLength={250000}
          onChange={(e) => change(setBefore, e.target.value)}
        />
        <TextField
          label="After"
          value={after}
          maxLength={250000}
          onChange={(e) => change(setAfter, e.target.value)}
        />
      </div>
      <Button
        type="button"
        className="rk-primary"
        onClick={() => {
          try {
            setResult(diffLines(before, after));
            setError("");
          } catch (e) {
            setError(message(e));
            setResult(null);
          }
        }}
      >
        Compare lines
      </Button>
      <Status error={!!error}>
        {error ||
          (result
            ? `${result.filter((x) => x.kind === "add").length} added · ${result.filter((x) => x.kind === "remove").length} removed`
            : "Compare up to 1,500 lines per version. Line endings are normalized; spaces are preserved.")}
      </Status>
      {result && (
        <>
          <div
            className="rk-diff"
            role="region"
            aria-label="Line comparison"
            tabIndex={0}
          >
            {result.length ? (
              result.map((line, i) => (
                <div className={`rk-diff-${line.kind}`} key={i}>
                  <span
                    aria-label={
                      line.kind === "add"
                        ? "Added"
                        : line.kind === "remove"
                          ? "Removed"
                          : "Unchanged"
                    }
                  >
                    {line.kind === "add"
                      ? "+"
                      : line.kind === "remove"
                        ? "−"
                        : " "}
                  </span>
                  <code>{line.text || "\u00a0"}</code>
                </div>
              ))
            ) : (
              <p>Both versions are empty.</p>
            )}
          </div>
          <Button
            type="button"
            disabled={exporting}
            aria-busy={exporting}
            onClick={() =>
              exportFile(
                new Blob(
                  [
                    result
                      .map(
                        (line) =>
                          `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.text}`,
                      )
                      .join("\n"),
                  ],
                  { type: "text/plain" },
                ),
                "rabta-comparison.txt",
              )
            }
          >
            Download comparison
          </Button>
        </>
      )}
      {exportFeedback}
    </>
  );
}
function Timestamps() {
  const { Button } = useUI();
  const [input, setInput] = useState(""),
    [unit, setUnit] = useState("Unix seconds"),
    [zone, setZone] = useState(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ),
    [result, setResult] = useState(""),
    [error, setError] = useState("");
  const reset = () => {
    setResult("");
    setError("");
  };
  return (
    <>
      <SelectField
        label="Input format"
        value={unit}
        options={["Unix seconds", "Unix milliseconds", "ISO with timezone"]}
        onChange={(value) => {
          setUnit(value);
          reset();
        }}
      />
      <InputField
        label="Timestamp or dated time"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          reset();
        }}
        placeholder={
          unit === "ISO with timezone"
            ? "2026-09-09T14:30:00-04:00"
            : "1788964200"
        }
      />
      <InputField
        label="Display timezone"
        value={zone}
        onChange={(e) => {
          setZone(e.target.value);
          reset();
        }}
        placeholder="America/New_York"
      />
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          onClick={() => {
            try {
              if (!validTimezone(zone))
                throw new Error(
                  "Use a valid timezone, such as America/New_York or UTC.",
                );
              const date = parseTimestamp(
                input,
                unit === "Unix seconds"
                  ? "seconds"
                  : unit === "Unix milliseconds"
                    ? "milliseconds"
                    : "ISO",
              );
              setResult(
                `UTC: ${date.toISOString()}\nUnix seconds: ${Math.floor(date.getTime() / 1000)}\nUnix milliseconds: ${date.getTime()}\n${zone}: ${new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: "full", timeStyle: "long" }).format(date)}`,
              );
              setError("");
            } catch (e) {
              setError(message(e));
              setResult("");
            }
          }}
        >
          Convert time
        </Button>
        <Button
          type="button"
          onClick={() => {
            setUnit("ISO with timezone");
            setInput(new Date().toISOString());
            reset();
          }}
        >
          Use current time
        </Button>
      </div>
      <Status error={!!error}>{error}</Status>
      <Output value={result} filename="rabta-timestamp.txt" />
    </>
  );
}
function Study() {
  const { exportFile, exporting, exportFeedback } = useFileExport();
  const { Button } = useUI();
  const [notes, setNotes] = useState(""),
    [cards, setCards] = useState<StudyCard[]>([]),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [mode, setMode] = useState("Flashcards"),
    [answer, setAnswer] = useState(""),
    [attempts, setAttempts] = useState<Record<number, string>>({}),
    [error, setError] = useState("");
  const card = cards[index],
    options = quizOptions(cards, index),
    correct = Object.entries(attempts).filter(
      ([key, value]) => cards[Number(key)]?.answer === value,
    ).length;
  const navigate = (next: number) => {
    setIndex(next);
    setRevealed(false);
    setAnswer(attempts[next] ?? "");
  };
  return (
    <>
      <TextField
        label="Your study notes"
        value={notes}
        maxLength={50000}
        onChange={(e) => {
          setNotes(e.target.value);
          setCards([]);
          setAttempts({});
          setError("");
        }}
        placeholder={
          "Photosynthesis: Plants turn light into chemical energy.\nMitosis: A cell divides into two genetically identical cells."
        }
      />
      <p className="rk-note">
        Use one term: definition per line. Other sentences become
        fill-in-the-blank cards. Questions use only your notes; check your
        source for accuracy. Up to 100 cards.
      </p>
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          onClick={() => {
            try {
              setCards(studyCards(notes));
              setIndex(0);
              setRevealed(false);
              setAnswer("");
              setAttempts({});
              setError("");
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Build study cards
        </Button>
      </div>
      <Status error={!!error}>{error}</Status>
      {card && (
        <>
          <SelectField
            label="Practice format"
            value={mode}
            options={["Flashcards", "Quiz"]}
            onChange={(value) => {
              setMode(value);
              setRevealed(false);
              setAnswer(attempts[index] ?? "");
            }}
          />
          <article
            className="rk-study-card"
            aria-label={`Card ${index + 1} of ${cards.length}`}
          >
            <p className="rk-meta">
              {index + 1} / {cards.length}
            </p>
            <h3>{card.question}</h3>
            {mode === "Flashcards" ? (
              <>
                <Button
                  type="button"
                  aria-expanded={revealed}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? "Hide answer" : "Reveal answer"}
                </Button>
                {revealed && <p className="rk-study-answer">{card.answer}</p>}
              </>
            ) : options.length < 2 ? (
              <p>
                Add at least two different answers to create a multiple-choice
                quiz.
              </p>
            ) : (
              <>
                <div className="rk-quiz-options">
                  {options.map((option) => (
                    <Button
                      type="button"
                      key={option}
                      disabled={!!attempts[index]}
                      aria-pressed={answer === option}
                      onClick={() => {
                        setAnswer(option);
                        setAttempts((value) => ({ ...value, [index]: option }));
                      }}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
                {answer && (
                  <Status>
                    {answer === card.answer
                      ? "Correct."
                      : `Review this one. Answer: ${card.answer}`}
                  </Status>
                )}
              </>
            )}
            {(revealed || answer) && (
              <details>
                <summary>Source note</summary>
                <p>{card.source}</p>
              </details>
            )}
          </article>
          <div className="rk-actions">
            <Button
              type="button"
              disabled={index === 0}
              onClick={() => navigate(index - 1)}
            >
              Previous card
            </Button>
            <Button
              type="button"
              disabled={index === cards.length - 1}
              onClick={() => navigate(index + 1)}
            >
              Next card
            </Button>
            <Button
              type="button"
              disabled={exporting}
              aria-busy={exporting}
              onClick={() =>
                exportFile(
                  new Blob([JSON.stringify(cards, null, 2)], {
                    type: "application/json",
                  }),
                  "rabta-study-cards.json",
                )
              }
            >
              Export cards
            </Button>
          </div>
          {mode === "Quiz" && (
            <Status>
              {correct} correct / {Object.keys(attempts).length} answered ·{" "}
              {cards.length} cards
            </Status>
          )}
          {Object.keys(attempts).length > 0 && mode === "Quiz" && (
            <Button
              type="button"
              onClick={() => {
                setAttempts({});
                setAnswer("");
                setIndex(0);
              }}
            >
              Restart quiz
            </Button>
          )}
        </>
      )}
      {exportFeedback}
      <p className="rk-note">
        Your notes stay in this open workbench. Export your cards before closing
        the app.
      </p>
    </>
  );
}

type PlannerDraft = {
  editing: string | null;
  title: string;
  channel: string;
  caption: string;
  wallTime: string;
  timezone: string;
};
const PLAN_KEY = "rabta.utility.content-plan.v1";
function ContentPlanner() {
  const { exportFile, exporting, exportFeedback } = useFileExport();
  const { Button } = useUI();
  const [posts, setPosts] = useState<PlannedPost[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [channel, setChannel] = useState(""),
    [caption, setCaption] = useState(""),
    [wallTime, setWallTime] = useState(""),
    [timezone, setTimezone] = useState(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [conflict, setConflict] = useState(false),
    [unreadable, setUnreadable] = useState(false),
    [undo, setUndo] = useState<PlannedPost | null>(null);
  const snapshot = useRef<string | null>(null),
    draftId = useRef(crypto.randomUUID());
  const [pendingPost, setPendingPost] = useState<PlannedPost | null>(null),
    [previousDraft, setPreviousDraft] = useState<PlannerDraft | null>(null);
  const currentDraft = (): PlannerDraft => ({
    editing,
    title,
    channel,
    caption,
    wallTime,
    timezone,
  });
  const restoreDraft = (draft: PlannerDraft) => {
    setEditing(draft.editing);
    setTitle(draft.title);
    setChannel(draft.channel);
    setCaption(draft.caption);
    setWallTime(draft.wallTime);
    setTimezone(draft.timezone);
    setError("");
  };
  const openPost = (post: PlannedPost) => {
    restoreDraft({ ...post, editing: post.id });
    setPendingPost(null);
    setStatus(
      "Editing saved draft. Changes are saved only when you choose Save changes.",
    );
  };

  const reload = () => {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      const saved = parsePlan(raw);
      setPosts(saved);
      snapshot.current = raw;
      setConflict(false);
      setUnreadable(false);
      setError("");
      setStatus("Saved plan loaded. Your open draft is still here.");
    } catch (e) {
      setUnreadable(true);
      setError(message(e));
    }
  };
  useEffect(() => {
    reload();
    const changed = (event: StorageEvent) => {
      if (event.key === PLAN_KEY || event.key === null) setConflict(true);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const commit = (next: PlannedPost[]) => {
    if (unreadable) {
      setError(
        "Saved plan could not be read. Export your current draft before repairing saved data.",
      );
      return false;
    }
    try {
      if (localStorage.getItem(PLAN_KEY) !== snapshot.current) {
        setConflict(true);
        setError(
          "The plan changed in another window. Reload it before saving; your draft is preserved.",
        );
        return false;
      }
      const serialized = JSON.stringify(next);
      localStorage.setItem(PLAN_KEY, serialized);
      snapshot.current = serialized;
      setPosts(next);
      setError("");
      setConflict(false);
      return true;
    } catch {
      setError(
        "The plan could not be saved. Keep your draft open or export it to a file.",
      );
      return false;
    }
  };
  const draft = () =>
    validatePost({
      id: editing ?? draftId.current,
      title,
      channel,
      caption,
      wallTime,
      timezone,
      instant: "",
    });
  const clear = () => {
    draftId.current = crypto.randomUUID();
    setPendingPost(null);
    setEditing(null);
    setTitle("");
    setChannel("");
    setCaption("");
    setWallTime("");
    setError("");
  };
  const update = (setter: (s: string) => void, value: string) => {
    setter(value);
    setStatus("");
    setError("");
  };
  return (
    <>
      <p className="rk-note rk-planner-disclosure">
        Plan here, publish on your platform. Calendar exports are reminders;
        Rabta does not auto-post or upload your captions.
      </p>
      <div className="rk-columns">
        <InputField
          label="Post title"
          value={title}
          maxLength={160}
          onChange={(e) => update(setTitle, e.target.value)}
        />
        <InputField
          label="Channel or account"
          value={channel}
          maxLength={100}
          placeholder="Instagram · Rabta"
          onChange={(e) => update(setChannel, e.target.value)}
        />
      </div>
      <TextField
        label="Caption or publishing notes"
        value={caption}
        maxLength={10000}
        onChange={(e) => update(setCaption, e.target.value)}
      />
      <div className="rk-columns">
        <InputField
          label="Scheduled date · YYYY-MM-DD HH:mm"
          value={wallTime}
          maxLength={16}
          placeholder="2026-09-15 14:30"
          onChange={(e) => update(setWallTime, e.target.value)}
        />
        <InputField
          label="Schedule timezone"
          value={timezone}
          maxLength={100}
          placeholder="America/New_York"
          onChange={(e) => update(setTimezone, e.target.value)}
        />
      </div>
      <p className="rk-meta">
        Use 24-hour time and a timezone such as America/New_York, Europe/London
        or UTC. Your calendar receives the exact instant.
      </p>
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          disabled={unreadable || conflict}
          onClick={() => {
            try {
              if (!editing && posts.length >= 100)
                throw new Error(
                  "Your plan has 100 drafts. Remove one before adding another.",
                );
              const post = draft(),
                next = [...posts.filter((p) => p.id !== post.id), post].sort(
                  (a, b) => a.instant.localeCompare(b.instant),
                );
              if (commit(next)) {
                clear();
                setStatus("Draft saved on this device.");
              }
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          {editing ? "Save changes on device" : "Save draft on device"}
        </Button>
        <Button
          type="button"
          disabled={exporting}
          aria-busy={exporting}
          onClick={async () => {
            try {
              setStatus("");
              await exportFile(
                new Blob([calendarExport([draft()])], {
                  type: "text/calendar;charset=utf-8",
                }),
                "rabta-post-reminder.ics",
                "Import it in your calendar to receive alerts.",
              );
              setError("");
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Export draft reminder
        </Button>
        <Button
          type="button"
          disabled={exporting}
          aria-busy={exporting}
          onClick={async () => {
            setStatus("");
            await exportFile(
              new Blob(
                [
                  JSON.stringify(
                    { title, channel, caption, wallTime, timezone },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "rabta-post-draft.json",
            );
          }}
        >
          Export draft text
        </Button>
        {editing && (
          <Button
            type="button"
            onClick={() => {
              setPreviousDraft(currentDraft());
              clear();
              setStatus(
                "Editing closed. Restore your previous draft below to recover unsaved changes.",
              );
            }}
          >
            Cancel edit
          </Button>
        )}
      </div>
      <Status error={!!error}>{error || status}</Status>
      {exportFeedback}
      {pendingPost && (
        <div className="rk-conflict">
          <p>
            Open “{pendingPost.title}” in the editor? Your current draft will be
            kept for recovery.
          </p>
          <div className="rk-actions">
            <Button type="button" onClick={() => setPendingPost(null)}>
              Keep current draft
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPreviousDraft(currentDraft());
                openPost(pendingPost);
              }}
            >
              Open saved draft
            </Button>
          </div>
        </div>
      )}
      {previousDraft && (
        <Button
          type="button"
          onClick={() => {
            const previous = previousDraft;
            setPreviousDraft(currentDraft());
            restoreDraft(previous);
            setPendingPost(null);
            setStatus("Previous draft restored.");
          }}
        >
          Restore previous draft
        </Button>
      )}
      {conflict && (
        <div className="rk-conflict">
          <p>
            The saved plan changed in another window. Reload it before saving
            again. Your open draft is preserved.
          </p>
          <Button type="button" onClick={reload}>
            Reload saved plan
          </Button>
        </div>
      )}
      <div className="rk-output-top rk-plan-heading">
        <h3>Saved plan · {posts.length}/100</h3>
        <Button
          type="button"
          disabled={!posts.length || exporting}
          aria-busy={exporting}
          onClick={async () => {
            try {
              setStatus("");
              await exportFile(
                new Blob([calendarExport(posts)], {
                  type: "text/calendar;charset=utf-8",
                }),
                "rabta-content-plan.ics",
                "Import it in your calendar for reminders.",
              );
              setError("");
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Export plan calendar
        </Button>
      </div>
      {!posts.length ? (
        <p className="rk-empty">
          Save your first draft to start a content plan.
        </p>
      ) : (
        <div className="rk-shelf" aria-label="Saved content drafts">
          {posts.map((post) => (
            <article key={post.id}>
              <h3>{post.title}</h3>
              <p className="rk-meta">
                {post.channel || "No channel"} · {post.wallTime} ·{" "}
                {post.timezone}
              </p>
              <pre>{post.caption || "No caption yet."}</pre>
              <div className="rk-inline">
                <Button
                  type="button"
                  onClick={() => {
                    if (title || channel || caption || wallTime)
                      setPendingPost(post);
                    else openPost(post);
                  }}
                >
                  Edit {post.title}
                </Button>
                <Button
                  type="button"
                  disabled={unreadable || conflict}
                  onClick={() => {
                    if (commit(posts.filter((p) => p.id !== post.id))) {
                      setUndo(post);
                      if (editing === post.id) setEditing(null);
                      setStatus("Draft removed. Undo is available.");
                    }
                  }}
                >
                  Remove {post.title}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {undo && (
        <Button
          type="button"
          disabled={posts.length >= 100 || conflict}
          onClick={() => {
            if (
              commit(
                [...posts.filter((post) => post.id !== undo.id), undo].sort(
                  (a, b) => a.instant.localeCompare(b.instant),
                ),
              )
            ) {
              setUndo(null);
              setStatus("Draft restored.");
            }
          }}
        >
          Undo remove
        </Button>
      )}
    </>
  );
}
export function AdvancedTool({ id }: { id: ToolId }) {
  switch (id) {
    case "diff":
      return <TextDiff />;
    case "timestamp":
      return <Timestamps />;
    case "study":
      return <Study />;
    case "planner":
      return <ContentPlanner />;
    default:
      return null;
  }
}
