# Rabta application UX contract

Reviewed 2026-09-07 against the desktop source and existing tests. `docs/vision.md` remains authoritative for current data access: local workspace metadata from explicitly connected tools. AI, a system overlay, cloud collaboration, and merchandise were discussed as future directions; this visual change does not ship those capabilities.

## Owners and controls

- Navigation: Zustand `view` and existing navigation history; `shell/nav.ts` supplies labels and shortcuts. Overview's QuietDock selects these same views. It is not a new routing system or an in-page tab bar.
- Route title: AppShell updates `document.title` to `{view label} — Rabta`. The title contains no task/file secrets. Screen headings remain owned by Toolbar and the existing pages.
- Native window bounds: `titlebar.ts`, SidebarPresence and the shell own geometry and collapse. The skip link still targets focusable `#main`.
- Fields/selects/dialogs: existing app wrappers around Radix. No native select or new date control is introduced. Capsule creation retains the existing composer; Enter is guarded during IME composition.
- Floating Lens controls are ordinary buttons in document order, not modal overlays. Existing Radix portals, restore sheet, command palette and Sonner viewport retain their stacking/focus owners.
- Scrollbars remain global in `index.css`; `lens-app.css` changes layout, not scrollbar ownership.

## Behavior ledger

| Operation | Pending and result | Recovery / focus |
| --- | --- | --- |
| Resume from Overview | `requestResume(taskId)` then Capsules; existing coordinator owns activation | Restore sheet reports each tool and handles partial/failed results; no optimistic success |
| Capture | Existing `save_capsule` invocation; blocked while capture/restore is active | Existing toast announces the actual captured/zero-captured outcome |
| Select capsule | Stable task ID through `selectCapsule` | Existing listbox keyboard navigation and master/detail selection |
| Rename | Trimmed title, existing mutation; busy blocks duplicate submit | Dialog preserves failure state; existing success/refresh handling |
| Delete | Existing deferred-delete/Undo workflow | No new immediate destructive path; tested rollback/timer semantics preserved |
| Pin resource | CapsuleItems and existing pin APIs | Uses actual saved metadata and preserves existing curation |
| Read Overview | Stable loading surface until projects, tasks and resources settle | A failed read shows LoadError with Retry, never an empty workspace; stale results are ignored |
| Quick connections | Same Connectors view as sidebar | Live status comes from connector state, not saved capture data |

## Data and state

Overview and Companion use `ContextMeasure` with actual counts from `capsuleChips`, not live reachability. Each tick represents a saved reference up to 80; larger totals explicitly disclose grouped markers and preserve exact textual totals. Zero is an owned capture-empty state, never a success check. Capsule detail uses `RestoreReadiness` with actual `insideCards` connectivity: one segment per tool, a visible reachable/total count, and a warning that the restore receipt owns actual results. A disconnected tool has text explaining the reconnect requirement; color is supplemental.

Resource reads are read-only. Failure copy does not guarantee disk integrity from an unsuccessful request. The new layout does not read file contents or collect screenshots, clipboard, keystrokes, browsing history, or team data.

## Reusable controls

ActionBridge preserves its label and geometry while busy, exposes `aria-busy`, and uses the native disabled attribute. The caller owns the async action/result. QuietDock controls keep accessible labels even in compact specimens. DotText falls back to normal text for unsupported scripts, empty values or strings over 40 characters; it does not silently truncate meaningful text.

Lens supplies material and optional decorative motion. Native/OS reduced motion and the app preference override it. Readability does not require animation or transparency. These controls do not own network retries, permissions, success toasts or file operations.

## Responsive and error boundaries

Overview stacks at 860px; long titles wrap. Capsule detail stacks below its bounded list at 620px so actions remain reachable. The application remains a viewport-bounded native desktop shell, not a document layout imposed on unrelated pages.

The app has no account/role routes requiring a new 403 page. Existing app error boundaries and page LoadError remain in charge. English product copy and the existing system-locale date/relative-time formatters remain current; no new locale, timezone or calendar policy is introduced.

## Companion and handoff contracts

Source: user product-family request, existing local capsule API and native Tauri window commands. Companion launches only by explicit menu action, keeps one window instance, and supports hiding and returning to Workspace. It cannot silently restore, share or change branches. Failed reads preserve recovery; overlapping reads discard stale results. Capture uses the existing task ID and reports real captured/skipped tools. The context dialog traps and restores focus through Radix; its exact reviewed text is copied on explicit request, never sent to a service. Teams is manual handoff only until an authenticated collaboration service is implemented.

## September 8 brand and geometry revision

The approved outlined lowercase wordmark replaces the old sidebar/Companion lockup. `ApprovedWordmark` is the shared drawing; the outer Lockup owns its accessible name and the nested SVG is decorative to avoid duplicate announcements. `ContextMeasure` and `RestoreReadiness` are noninteractive figures, not hidden controls. Existing capture, restore, dirty-branch protection, handoff, navigation and preferences remain unchanged. `context-measure.css` maps the shared geometry to existing app HSL semantic tokens, with no new global palette.

The September 9 integration adds 15 shared local utilities to the native app through the Utilities view. The website additionally offers image, SVG and media processing. Source edits do not constitute a signed Mac release.

## Family refinement — September 8, 2026

Five canonical products; Studio contains design and utility destinations. Launcher routes use the existing view store and open_url/open_companion commands. Companion launch is guarded by a synchronous pending ref. Clipboard completion only updates the current handoff revision; edits and dialog transitions invalidate stale feedback. Textareas retain bounded, scrollable canonical sizing.

Toolbar height/traffic-light clearance stays owned by titlebar.ts. Search compresses to an accessible icon at narrow widths. Settings rows stack rather than pushing controls out of their pane. Existing theme choices remain; sage is the default. See the website docs/rabta-teams-plan.md for the proposed hosted handoff flow; current manual copying does not imply live team delivery.

## Studio utilities and accounts — September 9 integration

Authority: `docs/account-policy.md` supersedes the old blanket no-account constraint. General settings opens real web account management; the desktop does not claim a native session or cloud workspace sync yet. Local connector consent remains separate from account identity.

| Surface              | Action and result                                                      | Failure / recovery                                                                                          | Persistence                                                          |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Search and tool rail | Search name/category; select one working tool; favorite it             | Empty search offers Clear; visible keyboard focus                                                           | Favorites on this device; inputs stay while workbench is mounted     |
| Scratchpad           | Autosave after 400 ms; flush on page hide; export Markdown             | Storage errors keep draft; other-window version conflict offers both copies; clear has Undo                 | Local profile only; no cloud sync                                    |
| Snippets             | Explicit Add/Edit/Copy; remove with Undo                               | Re-read before write; concurrent changes refresh list and preserve draft; corrupt storage never overwritten | Local, max 50 items, 10k characters each                             |
| Clipboard shelf      | Read only after click, then explicit Add                               | Permission denial offers manual paste                                                                       | Session only; no background monitoring                               |
| Transform tools      | User chooses format, submits, copies/downloads result                  | Validate input, clear stale output on edit, no automatic execution                                          | Memory only; max 200k characters                                     |
| Calculator / units   | Immediate useful result from bounded input                             | Arithmetic parser has no eval; reject division by zero, invalid units and impossible temperatures           | Memory only                                                          |
| Hash                 | SHA-256 text or file and compare expected digest                       | 50 MB bound, generation token suppresses stale results                                                      | Memory only                                                          |
| Password / UUID      | Explicit generation with browser crypto                                | Invalid length rejected; password masked by default, user can reveal/copy                                   | Never saved; copying uses system clipboard                           |
| Color lab            | Hex/RGB/HSL and contrast with actual preview                           | Invalid colors explained; unsupported eyedropper permits hex entry                                          | Memory only                                                          |
| Batch rename         | Preview names; download renamed copies in ZIP                          | Detect collisions/invalid names; limit 100 files/50 MB; cancel pending reads                                | Originals untouched; no upload                                       |
| Focus timer          | Start/pause/resume/reset; real deadline drives progress                | Input limits 1–180 min, completion text                                                                     | Survives tool selection while mounted; ends when workbench closes    |
| Mac controls         | Explicit native keep-awake, layout, volume, capture and system readout | Unsupported web runtime is labelled; permissions and command failures shown; no fake success                | Keep-awake is finite and stops on app exit; window undo session only |

All native actions use allowlisted commands and validated arguments. No shell evaluation. No automatic Accessibility or screen-recording permission grants. Async jobs expose pending/result/error states. Native permission UI and geometry require an actual Mac check.

Use existing host UI primitives and semantic tokens. Labels pair with fields. Menus support keyboard and Escape through Radix. Small layouts reflow without document overflow. Reduced-motion and forced-colors modes are supported. Automated core tests cover corrupt formats, injection-shaped strings, Unicode, ZIP integrity and conversion correctness.

## Expanded tools and Teams

Authority: the September 9 user request, `docs/product-direction.md`, and `docs/teams-service.md`. Earlier statements limiting Teams to manual copying or utilities to the website are superseded for the new preview. This does not expand the original stable release's capabilities.

| Capability | Canonical owner | State and recovery |
| --- | --- | --- |
| Mode and tool selection | shared workbench and modes catalog | Mode preference on this device; all tools remain accessible, search can be cleared |
| Select/listbox | desktop Radix Select through utility/creative adapters | Authored popup, labelled trigger, keyboard and Escape behavior |
| Typed schedule/date | content-planner fields | Explicit IANA timezone, typed date/time, invalid and ambiguous values explained; calendar export is a reminder |
| Tool export | lib/export-file.ts | Native Save panel, validated filename/size, explicit cancellation, error retains output |
| Image/media files | features/creative | Explicit picker, bounded decode, cancel stale jobs, originals preserved; unsupported codecs explained |
| Team connection | features/teams and Teams service | HTTPS remote or loopback HTTP; masked room/member credentials, no tokens in URL/log/browser storage; manual reconnect uses saved key |
| Team edits | private draft with revision | Preserve unsaved editor across navigation; reject stale saves, visible retry/review |
| Share preview | explicit publish or opt-in live share | Published snapshots only, real members/status, withdrawal and failure recovery |
| Proposals | recipient review then apply | Expected revision required at both steps; private target work cannot be overwritten by another member |
| Shared assets | authenticated upload/read/delete | Explicit upload only, type/size limits; deletion permission and confirmation |
| Clipboard history | native UtilityState | Off initially, explicit start, app exclusions, bounded retention, pause/clear; memory-only, stops on exit |
| AI utilities | MCP explicit-input transforms | Same generated utility core; no clipboard/files/network/native access granted by a transform |

All new views retain shared global scrollbar, toast, Radix dialog, form and Surface owners. Team credentials and private drafts are never put in route titles. OS save dialogs are intentionally platform-owned; browser alert/confirm/prompt remain prohibited. Native permission requests remain user-controlled.
