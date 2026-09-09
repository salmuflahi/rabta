# Rabta accounts — current direction

Decision owner: the user's instruction on 2026-09-09 to implement accounts and change the no-account rule. This supersedes blanket no-account/no-server prohibitions in older design briefs, comments and plans. Historical release and security documentation describes those releases; it must not be treated as a prohibition on the new architecture.

## Product rule

One Rabta identity for the family. Local tools remain immediately usable; an account is the place for deliberately saved work and, as implemented, connected devices and collaboration. Do not gate basic local editing or restoring a local workspace behind network availability. Accounts do not grant OS permissions or AI access.

## Implemented web account scope

The current Sites host supports dispatch-owned Sign in with ChatGPT. `/account` identifies a signed-in visitor without silently creating a profile. The user explicitly creates a Rabta profile containing a chosen display name and a bounded list of saved utility identifiers. D1 stores these with a generated Rabta UUID, the host's site-scoped subject, revision, and timestamps. Email is displayed from the sign-in session, not copied into the profile table. No passwords, files, clipboard contents, notes or workspace paths are collected by this flow.

The profile and tool list persist across browsers on the same Site. Local utility favorites/notes remain local and are not silently imported. The Account page is the launcher for the saved list. The user can edit and delete the profile. Profile deletion removes the live record, not their provider account, provider session or local files. Sign-out is a separate explicit action. No billing is implemented.

Server authorization derives ownership from dispatcher-provided identity, never client-supplied ownership. Each request also checks its originating view's identity to reject a changed sign-in session. Mutations check exact origin, JSON type, bounded payloads and revision. Responses are private/no-store. Concurrent saves fail visibly rather than overwriting. Production must be served exclusively through the trusted Sites dispatcher; direct origins accepting forged authentication headers must never expose this handler.

Desktop General settings opens the website Account page. This is browser account management, not a native authenticated session. The desktop connector hub remains authenticated locally and independent from the web account.

## Required next account integrations

| Outcome                      | Implementation required before claiming it works                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email, Google or Apple login | Configure a suitable identity provider and supported hosting path; retain the generated Rabta UUID when linking a verified new identity. Never join accounts merely by an unverified matching email. |
| Desktop account session      | Browser authorization with PKCE and state, short-lived device grant, Keychain token storage, revocation and an explicit device list. Never put tokens in web storage or deep-link query strings.     |
| Saved presets                | Versioned schema per real tool; explicit Save preset; no imported file contents in preferences.                                                                                                      |
| Workspaces across devices    | Opt-in dataset selection, path remapping, supported-app discovery, conflict copies and clear queued/offline state. Restoring is additive and never executes saved commands automatically.            |
| Shared assets                | User-selected uploads, ownership checks, limits, export/deletion and retention policy; keep source files local unless selected.                                                                      |
| Team                         | Explicit organization membership and resource grants. Invitations, role changes and deletion require their own product design before launch.                                                         |
| Connect / AI                 | User-chosen resource and action scopes. No remote clipboard, recording, shell, install, fan or deletion permission through a generic account token.                                                  |

These are acceptance boundaries, not shipped capability claims. Pricing remains undecided; do not add a paywall or subscription form.
