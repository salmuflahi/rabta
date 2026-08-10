import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { SwitchMac } from "@/components/ui/switch-mac";
import { toastErr, toastOk } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  useStore,
  type MigrateInclude,
  type MigrateMerge,
  type MigrateState,
} from "@/store";

// --- shapes returned by the Rust side -------------------------------------

interface Survey {
  capsules: number;
  projects: number;
  pairings: number;
  history: number;
}

interface AppInstalled {
  kind: string;
  capsules: number;
  label: string;
  /** `null` means this build cannot check — Git isn't an app bundle,
   * Terminal ships with macOS. Not the same as "missing". */
  installed: boolean | null;
}

interface RepoPresent {
  name: string;
  path: string;
  branch: string;
  present: boolean;
}

interface InspectResult {
  capsules: number;
  projects: number;
  pairings: number;
  history: number;
  hasPreferences: boolean;
  sourceHome: string | null;
  remapProjects: number;
  remapPaths: number;
  collisions: { kind: string; name: string }[];
  appsInstalled: AppInstalled[];
  reposPresent: RepoPresent[];
  thisHome: string | null;
}

interface ExportResult {
  path: string;
  bytes: number;
}

interface ApplyOutcome {
  projectsAdded: number;
  projectsReplaced: number;
  projectsSkipped: number;
  capsulesAdded: number;
  pairingsAdded: number;
  eventsAdded: number;
  pathsRemapped: number;
}

/** Human file size for the File step. The handoff prints "≈ 1.2 MB in
 * total"; this is the real number, so it says the size it actually wrote. */
function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// --- small pieces ----------------------------------------------------------

function GroupHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("pl-0.5 text-sub font-semibold text-muted-foreground", className)}>{children}</p>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[10px] bg-card p-4 shadow-raised", className)}>{children}</div>;
}

/** One of the two "How" cards. The selected one takes a 1.5px accent ring
 * and an accent radio, per the handoff. */
function TransportCard({
  icon,
  title,
  description,
  selected,
  disabled,
  disabledReason,
  onSelect,
}: {
  icon: IconName;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-default items-start gap-3 rounded-[10px] bg-card p-4 text-left transition-shadow duration-fast ease-standard",
        selected
          ? "shadow-[0_0_0_1.5px_hsl(var(--primary))]"
          : "shadow-raised hover:shadow-[0_0_0_1px_hsl(var(--border))]",
        disabled && "opacity-60",
      )}
    >
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-510 text-foreground">{title}</span>
        <span className="mt-1 block text-meta leading-[1.5] text-muted-foreground">
          {description}
        </span>
        {disabled && disabledReason && (
          <span className="mt-1.5 block text-meta text-warn">{disabledReason}</span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full",
          selected ? "bg-primary" : "shadow-[0_0_0_1px_hsl(var(--border))]",
        )}
      >
        {selected && <span className="size-[5px] rounded-full bg-white" />}
      </span>
    </button>
  );
}

/** One row of the "What comes across" list. */
function IncludeRow({
  id,
  title,
  count,
  note,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  count?: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b-[0.5px] border-border py-2.5 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-body text-foreground">
          {title}
          {count && <span className="ml-2 tabular-nums text-tertiary-foreground">{count}</span>}
        </label>
        {note && <p className="mt-0.5 text-meta text-tertiary-foreground">{note}</p>}
      </div>
      <SwitchMac id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

// --- the sheet -------------------------------------------------------------

const SEND_STEPS = ["How", "What comes across", "File", "Done"];
const RECEIVE_STEPS = ["How", "File", "Review", "Applying", "Done"];

/**
 * The Migrate flow — Settings › Migrate, and the palette's Migrate /
 * Receive actions.
 *
 * Send: how → what comes across → file → done.
 * Receive: how → file → review → applying → done.
 *
 * Every number on screen comes from the Rust side (`migrate_survey`,
 * `migrate_inspect`) rather than from the handoff's example figures. That
 * is the whole point of the review step: it tells you what *your* two Macs
 * disagree about, and a fabricated count would be a lie the user only
 * discovers afterwards.
 *
 * DIVERGENCES FROM THE HANDOFF, all deliberate:
 *
 *  - **Only the encrypted-file transport works.** Nearby Mac is drawn, and
 *    disabled with its reason. Building it would put this app's data on a
 *    network for the first time, against its own positioning line; that is
 *    a product decision, recorded rather than quietly made.
 *  - **No "Clone the three repos now".** Rabta stores a project's local
 *    path, not its git remote, so there is nothing to clone *from*. The
 *    Repositories group reports which folders are actually here at the
 *    remapped path, which is the true and useful half of that question.
 *  - **Paths are typed, not picked.** A native file picker needs the Tauri
 *    dialog plugin; the field is pre-filled with a sensible default so the
 *    common case is one keystroke, and the plugin is a follow-up.
 *  - **No progress bar during Applying.** The apply is one SQLite
 *    transaction that finishes in milliseconds — animating a 2.5s bar over
 *    it, as the prototype does, would be inventing work that isn't
 *    happening.
 */
export function MigrateSheet() {
  const mig = useStore((s) => s.mig);
  const closeMigrate = useStore((s) => s.closeMigrate);
  const patch = useStore((s) => s.patchMigrate);
  const setView = useStore((s) => s.setView);

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [exported, setExported] = useState<ExportResult | null>(null);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const open = mig !== null;
  const role = mig?.role ?? "send";
  const steps = role === "send" ? SEND_STEPS : RECEIVE_STEPS;

  // Fresh counts every time the sheet opens: a survey from a previous
  // session would describe a Mac that has since changed.
  useEffect(() => {
    if (!open) {
      setSurvey(null);
      setInspect(null);
      setExported(null);
      setOutcome(null);
      return;
    }
    invoke<Survey>("migrate_survey").then(setSurvey).catch((e) => console.error("survey:", e));
    invoke<string | null>("migrate_home")
      .then((home) => {
        if (!home) return;
        patch({
          remap: home,
          path:
            role === "send"
              ? `${home}/Desktop/rabta-${new Date().toISOString().slice(0, 10)}.rabta`
              : "",
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (step: number) => patch({ step });

  const runExport = useCallback(async () => {
    if (!mig) return;
    setBusy(true);
    try {
      const preferences = mig.include.preferences ? localStorage.getItem("rabta.prefs") : null;
      const result = await invoke<ExportResult>("migrate_export", {
        path: mig.path,
        passphrase: mig.passphrase,
        include: mig.include,
        preferences,
      });
      setExported(result);
      patch({ step: 3 });
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }, [mig, patch]);

  const runInspect = useCallback(async () => {
    if (!mig) return;
    setBusy(true);
    try {
      const result = await invoke<InspectResult>("migrate_inspect", {
        path: mig.path,
        passphrase: mig.passphrase,
        newHome: mig.remap || null,
      });
      setInspect(result);
      patch({ step: 2 });
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }, [mig, patch]);

  const runApply = useCallback(async () => {
    if (!mig) return;
    setBusy(true);
    patch({ step: 3 });
    try {
      const result = await invoke<ApplyOutcome>("migrate_apply", {
        path: mig.path,
        passphrase: mig.passphrase,
        plan: { newHome: mig.remap || null, merge: mig.merge },
      });
      setOutcome(result);

      // Preferences live in localStorage, so the frontend installs them —
      // the Rust side deliberately hands the string back rather than
      // writing something it doesn't own.
      const prefs = await invoke<string | null>("migrate_preferences", {
        path: mig.path,
        passphrase: mig.passphrase,
      });
      if (prefs) {
        try {
          localStorage.setItem("rabta.prefs", prefs);
        } catch {
          /* a full disk shouldn't fail the migration that already landed */
        }
      }
      patch({ step: 4 });
    } catch (e) {
      toastErr(e);
      patch({ step: 2 });
    } finally {
      setBusy(false);
    }
  }, [mig, patch]);

  if (!mig) return null;

  const body = role === "send" ? renderSend() : renderReceive();

  function renderSend() {
    switch (mig!.step) {
      case 0:
        return (
          <div role="radiogroup" aria-label="How to send" className="flex flex-col gap-2.5 pb-2">
            <TransportCard
              icon="archive"
              title="Encrypted file"
              description="Export a .rabta bundle and carry it over — AirDrop, a drive, anywhere."
              selected={mig!.transport === "file"}
              onSelect={() => patch({ transport: "file" })}
            />
            <TransportCard
              icon="wifi"
              title="Nearby Mac"
              description="Both Macs on the same Wi-Fi. The new one types a six-digit code."
              selected={false}
              disabled
              disabledReason="Not built yet — it would be the first thing Rabta sends over a network, so it needs a deliberate decision first. Use the encrypted file."
              onSelect={() => {}}
            />
          </div>
        );
      case 1:
        return (
          <div className="pb-2">
            <Card className="py-0">
              <IncludeRow
                id="mig-capsules"
                title="Capsules"
                count={survey ? String(survey.capsules) : undefined}
                checked={mig!.include.capsules}
                onChange={(v) => setInclude("capsules", v)}
              />
              <IncludeRow
                id="mig-projects"
                title="Projects"
                count={survey ? String(survey.projects) : undefined}
                note={
                  mig!.include.capsules
                    ? "Included automatically — a capsule needs its project to have a name."
                    : undefined
                }
                checked={mig!.include.projects || mig!.include.capsules}
                disabled={mig!.include.capsules}
                onChange={(v) => setInclude("projects", v)}
              />
              <IncludeRow
                id="mig-pairings"
                title="Connector pairings"
                count={survey ? String(survey.pairings) : undefined}
                note="You re-approve them on the new Mac — the credentials never leave this one."
                checked={mig!.include.pairings}
                onChange={(v) => setInclude("pairings", v)}
              />
              <IncludeRow
                id="mig-preferences"
                title="Preferences"
                checked={mig!.include.preferences}
                onChange={(v) => setInclude("preferences", v)}
              />
              <IncludeRow
                id="mig-history"
                title="History"
                count={survey ? `${survey.history} events` : undefined}
                checked={mig!.include.history}
                onChange={(v) => setInclude("history", v)}
              />
            </Card>
            <p className="mt-3 flex items-center gap-1.5 text-meta text-tertiary-foreground">
              <Icon name="shield" className="size-3 shrink-0" />
              Saves paths, URLs and branch names — never your files, pages or passwords.
            </p>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-4 pb-2">
            <div>
              <GroupHeading>Save to</GroupHeading>
              <Input
                aria-label="Save to"
                className="mt-1.5 h-8 font-mono text-meta"
                value={mig!.path}
                onChange={(e) => patch({ path: e.target.value })}
                placeholder="~/Desktop/rabta.rabta"
              />
            </div>
            <div>
              <GroupHeading>Passphrase</GroupHeading>
              <Input
                aria-label="Passphrase"
                type="password"
                className="mt-1.5 h-8"
                value={mig!.passphrase}
                onChange={(e) => patch({ passphrase: e.target.value })}
                placeholder="Something you'll remember"
              />
              <p className="mt-2 text-meta leading-[1.5] text-warn">
                Without it the bundle is unreadable — Rabta cannot recover it for you.
              </p>
            </div>
          </div>
        );
      default:
        return (
          <div className="pb-2">
            <p className="text-card-title font-590 text-foreground">
              Written to {exported ? exported.path.split("/").pop() : "the bundle"}
            </p>
            <p className="mt-1 text-sub text-muted-foreground">
              {exported ? `${humanBytes(exported.bytes)} · ${exported.path}` : ""}
            </p>
            <p className="mt-3 text-sub text-muted-foreground">Nothing was removed from this Mac.</p>
          </div>
        );
    }
  }

  function renderReceive() {
    switch (mig!.step) {
      case 0:
        return (
          <div role="radiogroup" aria-label="How to receive" className="flex flex-col gap-2.5 pb-2">
            <TransportCard
              icon="archive"
              title="Encrypted file"
              description="Open a .rabta bundle carried over from the other Mac."
              selected={mig!.transport === "file"}
              onSelect={() => patch({ transport: "file" })}
            />
            <TransportCard
              icon="wifi"
              title="Nearby Mac"
              description="Both Macs on the same Wi-Fi. Type the six-digit code the other one shows."
              selected={false}
              disabled
              disabledReason="Not built yet — it would be the first thing Rabta sends over a network, so it needs a deliberate decision first. Use the encrypted file."
              onSelect={() => {}}
            />
          </div>
        );
      case 1:
        return (
          <div className="flex flex-col gap-4 pb-2">
            <div>
              <GroupHeading>Bundle</GroupHeading>
              <Input
                aria-label="Bundle"
                className="mt-1.5 h-8 font-mono text-meta"
                value={mig!.path}
                onChange={(e) => patch({ path: e.target.value })}
                placeholder="~/Downloads/rabta-2026-08-10.rabta"
              />
            </div>
            <div>
              <GroupHeading>Passphrase</GroupHeading>
              <Input
                aria-label="Passphrase"
                type="password"
                className="mt-1.5 h-8"
                value={mig!.passphrase}
                onChange={(e) => patch({ passphrase: e.target.value })}
              />
            </div>
            <p className="text-meta text-tertiary-foreground">
              Nothing is written until you have seen what's in it.
            </p>
          </div>
        );
      case 2:
        return <Review inspect={inspect} mig={mig!} patch={patch} />;
      case 3:
        return (
          <div className="pb-2">
            <p className="text-card-title font-590 text-foreground">Applying…</p>
            <p className="mt-1 text-sub text-muted-foreground">
              One transaction — if anything fails, this Mac is left exactly as it was.
            </p>
          </div>
        );
      default:
        return (
          <div className="pb-2">
            <p className="text-card-title font-590 text-foreground">
              {outcome
                ? `${plural(outcome.capsulesAdded, "capsule")} ${
                    outcome.capsulesAdded === 1 ? "is" : "are"
                  } on this Mac — nothing is open yet.`
                : "Done."}
            </p>
            <p className="mt-1 text-sub text-muted-foreground">
              Restore a capsule when you want it.
            </p>
            {outcome && (
              <p className="mt-3 text-meta text-tertiary-foreground">
                {[
                  outcome.projectsAdded && plural(outcome.projectsAdded, "project") + " added",
                  outcome.projectsReplaced && plural(outcome.projectsReplaced, "project") + " replaced",
                  outcome.projectsSkipped && plural(outcome.projectsSkipped, "project") + " skipped",
                  outcome.pathsRemapped && plural(outcome.pathsRemapped, "path") + " remapped",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        );
    }
  }

  function setInclude(key: keyof MigrateInclude, value: boolean) {
    patch({ include: { ...mig!.include, [key]: value } });
  }

  // --- footer wiring -------------------------------------------------------

  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  let onBack: (() => void) | undefined;

  if (role === "send") {
    if (mig.step === 0) primary = { label: "Continue", onClick: () => go(1) };
    if (mig.step === 1) {
      onBack = () => go(0);
      primary = { label: "Continue", onClick: () => go(2) };
    }
    if (mig.step === 2) {
      onBack = () => go(1);
      primary = {
        label: busy ? "Writing…" : "Write bundle",
        onClick: () => void runExport(),
        disabled: busy || !mig.path.trim() || !mig.passphrase.trim(),
      };
    }
    if (mig.step === 3) primary = { label: "Done", onClick: closeMigrate };
  } else {
    if (mig.step === 0) primary = { label: "Continue", onClick: () => go(1) };
    if (mig.step === 1) {
      onBack = () => go(0);
      primary = {
        label: busy ? "Opening…" : "Open bundle",
        onClick: () => void runInspect(),
        disabled: busy || !mig.path.trim() || !mig.passphrase.trim(),
      };
    }
    if (mig.step === 2) {
      onBack = () => go(1);
      primary = {
        label: "Apply",
        onClick: () => void runApply(),
        disabled: busy || !inspect,
      };
    }
    // Step 3 (Applying) has no forward action — it is doing the thing.
    if (mig.step === 4) {
      primary = {
        label: "Go to Capsules",
        onClick: () => {
          closeMigrate();
          setView("capsules");
          toastOk("Migration applied");
        },
      };
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && closeMigrate()}
      title={role === "send" ? "Send to another Mac" : "Receive from another Mac"}
      subtitle={
        role === "send"
          ? "Nothing is removed from this Mac."
          : "Nothing is written until you have reviewed it."
      }
      step={{ current: mig.step + 1, total: steps.length }}
      onBack={onBack}
      primary={primary}
    >
      {body}
    </Sheet>
  );
}

/** The review step — the handoff calls it "the substance of the feature".
 * Four groups, each answering something the two Macs disagree about. */
function Review({
  inspect,
  mig,
  patch,
}: {
  inspect: InspectResult | null;
  mig: MigrateState;
  patch: (p: Partial<MigrateState>) => void;
}) {
  if (!inspect) {
    return <p className="pb-2 text-sub text-muted-foreground">Opening the bundle…</p>;
  }

  const missingApps = inspect.appsInstalled.filter((a) => a.installed === false);
  const missingRepos = inspect.reposPresent.filter((r) => !r.present);

  return (
    <div className="flex flex-col gap-5 pb-2">
      <section>
        <GroupHeading>Folders</GroupHeading>
        <Card className="mt-1.5">
          <p className="font-mono text-meta text-muted-foreground">
            {inspect.sourceHome ?? "the other Mac"} →
          </p>
          <Input
            aria-label="New home folder"
            className="mt-1.5 h-8 font-mono text-meta"
            value={mig.remap}
            onChange={(e) => patch({ remap: e.target.value })}
          />
          <p className="mt-2 text-meta text-tertiary-foreground">
            Applies to {plural(inspect.remapProjects, "project")} and{" "}
            {plural(inspect.remapPaths, "saved file path")}.
          </p>
        </Card>
      </section>

      <section>
        <GroupHeading>Apps</GroupHeading>
        <Card className="mt-1.5 py-1">
          {inspect.appsInstalled.map((a) => (
            <div
              key={a.kind}
              className="flex items-center gap-2 border-b-[0.5px] border-border py-2 text-sub last:border-b-0"
            >
              <Icon
                name={a.installed === false ? "alert" : "check"}
                className={cn(
                  "size-[13px] shrink-0",
                  a.installed === false ? "text-warn" : "text-ok",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{a.label}</span>
              <span className="shrink-0 text-meta text-tertiary-foreground">
                {a.installed === true
                  ? "installed"
                  : a.installed === false
                    ? "not installed"
                    : "built in"}
              </span>
            </div>
          ))}
          {missingApps.length > 0 && (
            <p className="pb-2 pt-2 text-meta leading-[1.5] text-warn">
              Capsules that used {missingApps.map((a) => a.label).join(", ")} will restore
              everything else and leave that part alone.
            </p>
          )}
        </Card>
      </section>

      <section>
        <GroupHeading>Repositories</GroupHeading>
        <Card className="mt-1.5 py-1">
          {inspect.reposPresent.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-2 border-b-[0.5px] border-border py-2 last:border-b-0"
            >
              <Icon
                name={r.present ? "check" : "alert"}
                className={cn("size-[13px] shrink-0", r.present ? "text-ok" : "text-warn")}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-meta text-foreground">
                {r.path}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-tertiary-foreground">
                {r.branch}
              </span>
            </div>
          ))}
          {/* The handoff offers "Clone the three repos now". Rabta stores a
              project's local path, not its git remote, so there is nothing
              to clone from — saying which folders are missing is the true
              half of that question. */}
          <p className="pb-2 pt-2 text-meta leading-[1.5] text-tertiary-foreground">
            {missingRepos.length === 0
              ? "Every repository is already here. Nothing is cloned, pushed, reset or discarded."
              : `${plural(missingRepos.length, "folder")} ${
                  missingRepos.length === 1 ? "isn't" : "aren't"
                } here yet. Clone or copy them and the capsules will find them — Rabta never clones, pushes, resets or discards on your behalf.`}
          </p>
        </Card>
      </section>

      {inspect.collisions.length > 0 && (
        <section>
          <GroupHeading>Already on this Mac</GroupHeading>
          <Card className="mt-1.5">
            <p className="text-sub text-foreground">
              {plural(inspect.collisions.length, "name")} already{" "}
              {inspect.collisions.length === 1 ? "exists" : "exist"} here:{" "}
              <span className="text-muted-foreground">
                {inspect.collisions.map((c) => c.name).join(", ")}
              </span>
            </p>
            <div className="mt-3">
              <Segmented
                ariaLabel="What to do about names that already exist"
                value={mig.merge}
                onChange={(v) => patch({ merge: v as MigrateMerge })}
                options={[
                  { value: "keepBoth", label: "Keep both" },
                  { value: "replace", label: "Replace" },
                  { value: "skip", label: "Skip" },
                ]}
              />
            </div>
            <p
              className={cn(
                "mt-2.5 text-meta leading-[1.5]",
                mig.merge === "replace" ? "text-warn" : "text-tertiary-foreground",
              )}
            >
              {mig.merge === "keepBoth" &&
                "The incoming ones arrive under a new name. Nothing here is touched."}
              {mig.merge === "replace" &&
                `The ${
                  inspect.collisions.length === 1 ? "one" : plural(inspect.collisions.length, "one")
                } here ${
                  inspect.collisions.length === 1 ? "is" : "are"
                } overwritten, along with their capsules. That cannot be undone.`}
              {mig.merge === "skip" &&
                "This Mac's versions are kept. The incoming ones are not applied, and neither are their capsules."}
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
