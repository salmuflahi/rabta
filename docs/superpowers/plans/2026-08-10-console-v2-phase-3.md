# Console v2 — Phase 3 Record: Migrate

**Status:** shipped, on the encrypted-file transport. Branch
`feat/console-v2-phase-2` (Phase 2 and 3 ran back to back in one arc).

Phase 3 is the handoff's Migrate flow. It is the first arc in this project
that could not be done in the frontend: there was no export, no import, and
no file format. Roughly half of it is Rust.

**Spec:** the handoff's "The Migrate flow" section.

---

## What shipped

| Piece | Where |
| --- | --- |
| macOS sheet (620px, slides from under the titlebar, swallows the keyboard) | `src/components/ui/sheet.tsx` |
| `.rabta` bundle format + export | `crates/omnibus-db/src/bundle.rs` |
| Review computation + apply | `crates/omnibus-db/src/bundle_apply.rs` |
| Filesystem/machine answers, Tauri commands | `apps/desktop/src-tauri/src/migrate.rs` |
| Send and Receive flows | `src/features/migrate/MigrateSheet.tsx` |
| Settings › Migrate, palette actions | `SettingsPage.tsx`, `CommandPalette.tsx` |

**Send:** how → what comes across → file → done.
**Receive:** how → file → review → applying → done.

Every number on screen is real. The handoff prints example figures
("Capsules 6", "≈ 1.2 MB", "Applies to 3 projects and 14 saved file
paths"); each of those is now computed for the two Macs actually involved.

---

## The two decisions that shaped it

**1. The format is `age`, not something hand-rolled.** The handoff promises
the user *"Without it the bundle is unreadable — Rabta cannot recover it
for you."* That is a claim about cryptography, and this project does not
get to make it on the strength of an afternoon with a cipher. age is
specified, reviewed, and has a published CLI — so the promise rests on
something outside this repo, and a user can recover their own data with
`age -d` and no Rabta at all.

**2. Pairing tokens do not cross.** The handoff's own note on that
checkbox is "You re-approve them on the new Mac", and that is the whole
design: what travels is the fact that you approved Chrome, never the
credential that lets something act as Chrome. A bundle is a file that ends
up in Downloads, on a USB stick, in an AirDrop. There is a test that fails
if a token ever appears in one.

---

## Divergences from the handoff

1. **Nearby Mac is not built.** It is drawn, and disabled with the reason
   on the card. A six-digit code over Wi-Fi would be the first thing this
   app puts on a network, and its own positioning line is "Talks to Rabta
   on this Mac only — nothing leaves it". That is a product decision, not a
   design one. The review step is transport-independent, so adding it later
   costs no rework.

2. **No "Clone the three repos now".** Rabta stores a project's local path,
   not its git remote — there is nothing to clone *from*. The Repositories
   group reports which folders are actually present at the remapped path,
   which is the true and useful half of that question, and repeats the
   safe-git promise.

3. **No progress bar during Applying.** The apply is one SQLite transaction
   that finishes in milliseconds. Animating the prototype's 2.5s bar over
   it would be inventing work that isn't happening.

4. **Paths are typed, not picked.** A native picker needs the Tauri dialog
   plugin. The field is pre-filled with a sensible default so the common
   case is one keystroke. Adding the plugin is the obvious follow-up.

5. **Five include toggles, not six.** The handoff's "Open windows and tabs
   (now)" is a live capture at export time, which is Capture, not Migrate —
   ⌘S before sending does exactly that, and duplicating it here would give
   two buttons that mean the same thing.

---

## Invariants the tests hold

Rust (`crates/omnibus-db/tests/bundle*.rs`, 21 tests):

- Nothing recognisable survives in the ciphertext; a wrong passphrase says
  *passphrase*, not a stack trace.
- Unticked sections are absent from the file, not filtered on the way out.
- Capsules drag their projects along whatever the Projects checkbox says —
  a task whose project didn't cross is a dangling key with no name to show.
- The remap matches whole path segments only: `/Users/sam` does not rewrite
  `/Users/samantha/code`.
- Counting paths and rewriting them are the *same walk*, so the number the
  user is shown cannot disagree with what happens.
- Collisions match on name, not id — ids are UUIDs and would report "no
  conflicts" for two unrelated `atlas-api`s.
- Skip drops the capsules whose project was skipped rather than writing
  rows unreachable from the UI; Replace really does overwrite, including
  the local project's own capsules, which is what makes "That cannot be
  undone" true.
- An incoming pairing never clears one that already works here.
- A bundle from a newer build is refused before anything is written.

Frontend (`MigrateSheet.test.tsx`, `sheet.test.tsx`, 32 tests):

- The sheet stops every global shortcut while open — ⌘S mid-transfer would
  otherwise capture a capsule, ⌘1 would navigate the window away.
- Initial focus is off the footer, or "enter advances" would have
  *cancelled* the migration on the first keypress.
- A failed write stays on the File step; a failed apply returns to the
  review. Neither claims success.
- The merge warning changes with the choice, and Replace's says it cannot
  be undone.

---

## Verification

`pnpm test` (570), `pnpm exec tsc -b --noEmit`, `pnpm build`,
`cargo test` (89) and `pnpm tauri build` all clean. The sheet was checked
by hand in the capture rig at every step.

One gap: the packaged `.app` was launched and is running, but
`screencapture` would only return the desktop on the last few attempts, so
Phase 3 was **not** eyeballed in the packaged build specifically — only in
the dev/capture builds, which share the same bundle. Worth one look before
release.

---

## Still open

- **Nearby Mac**, if the product decides the positioning line can change.
- **A native file picker** (`tauri-plugin-dialog`).
- **Capsule-level collisions.** Only project names are compared today;
  two Macs with the same capsule title under different projects do not
  collide, which is correct, but same-project duplicates are currently
  resolved by id rather than offered to the user.
- Everything under the handoff's "Not yet designed", unchanged from
  Phase 2's list.
