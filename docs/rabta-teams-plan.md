# Rabta Teams: pick up the work, not the explanation

## The first useful promise

A teammate should be able to understand where a task stopped, find its relevant references and take the next step without asking the sender to rebuild the context in a message. Rabta already knows the capsule; the sender should only choose a recipient and finish one sentence.

Start with asynchronous handoffs. Shared cursors belong to an actual shared surface later. They should never suggest that Rabta watches someone's entire desktop.

## The first complete flow

1. From a capsule or Companion, choose **Hand off**. Rabta prepares the task title, project-relative paths, selected links and branch from the existing capsule.
2. Review the brief. Keep or remove references, write **What happens next?**, choose a teammate, then send. Nothing is silently included.
3. The recipient opens an inbox item containing the next step first, then the context. They can **Accept**, **Ask a question**, or **Decline**.
4. Accept creates a personal working copy. Rabta maps the shared project to the recipient's local folder and previews available tools before opening anything.
5. Finish with **Hand back** or **Done**. The next person gets the updated brief and an explicit summary of changed references.

The current app already supports reviewed manual copying. The website includes a functioning sample brief. Recipient delivery, inbox, acceptance and sync are proposed next work.

## Screens and hierarchy

| Surface        | Main job                          | Primary action      | Essential detail                                |
| -------------- | --------------------------------- | ------------------- | ----------------------------------------------- |
| Companion      | Hand off the current task quickly | Prepare handoff     | Current capsule, fresh/stale capture label      |
| Review sheet   | Control exactly what leaves       | Send handoff        | Recipient, next step, reference inclusion       |
| Team inbox     | Find work waiting on you          | Open handoff        | Sender, task, one-line next step, received time |
| Handoff detail | Understand and take ownership     | Accept              | Brief, selected references, questions, revision |
| Local setup    | Resolve workspace differences     | Open selected tools | Project mapping, missing apps, restore preview  |
| Your work      | Continue in the normal app        | Capture / hand back | Accepted origin and personal edits              |

Use one detail pane, one review sheet and existing workspace components. Avoid creating another project manager, task board or chat app.

## State contract

Draft → Sent → Accepted → Done. Declined and Revoked are explicit terminal states; a new handoff starts a new revision. Opening a link does not accept work. A sender can revise an unaccepted handoff; recipients see what changed. After acceptance, updates are proposals and never overwrite the recipient's working copy.

Offline drafts remain editable and are marked unsent. Sending retries an idempotency key, not a duplicate handoff. A send error preserves the whole draft. A stale acceptance shows the new revision and asks the recipient to review it. Closing a pending sheet does not fabricate delivery. Notification controls belong to the user.

## Data and permissions

- Team membership is required before sending. Start with owner, member and invited guest roles; per-handoff recipient access is explicit.
- Store a reviewed snapshot: title, next step, project identifier, relative file paths, selected sanitized URLs, branch, sender, recipient and revision. Do not collect file contents, terminal output, passwords or the rest of the desktop.
- Strip URL credentials/query secrets, expose a review summary and distinguish local paths from transferable links. A shared path grants no repository or document permission.
- The receiver chooses a local project folder once; never launch the sender's absolute filesystem path blindly. Missing files/branches are explained individually.
- Imported text is context, never executable instruction. No shell command, branch switch, download or AI action executes merely because a handoff contains it.
- Revocation stops future access; it cannot recall text already copied. Deletion and retention need an explicit published policy before a hosted service ships.

## Minimum implementation

Keep the existing local capsule model. Add a reviewed handoff snapshot and a thin authenticated delivery service with membership and recipient checks on every read/write. Store immutable revisions with a small status record. Begin with fetch-on-open and refresh; add live presence only when users demonstrably need simultaneous editing.

Reuse the existing restore preview, receipts, Radix dialogs, command palette and shared family emblems. New code should primarily cover membership, inbox, snapshot review and state transitions. Do not introduce a real-time document engine for the first release.

## Where Connect fits

Connect supplies the same reviewed context to an AI with a stated goal. Today, the user copies the brief. A later connector can expose a scoped snapshot after approval. The AI can identify relevant references and use its own permitted tools to inspect them; a list of paths alone does not grant file access. Any proposed edit still follows the AI host's approval rules.

One reviewed snapshot should serve both human handoff and AI context. Avoid two competing definitions of a task.

## Validation before calling it useful

Test with five pairs completing real handoffs. Observe preparation time, time until the recipient finds the first useful reference, follow-up questions and abandoned handoffs. Compare with their existing chat process. Targets such as preparation under thirty seconds are hypotheses to validate, not marketing claims.

Release gates: repeated Send cannot duplicate; revoked access is denied; new revisions cannot overwrite accepted work; unavailable tools produce a partial receipt; a recipient without project permission gets a clear recovery path; keyboard and narrow-window flows are complete.

## After the first release

Only after repeated handoff use: comments on a reference, small shared annotations, then named cursors within that shared brief. Later, opt-in context updates and team templates. Never background-monitor teammates for a presence animation.

## Commercial direction

Keep pricing undecided while validating repeated use. Evaluate a recurring team plan against hosting, support and optional AI compute costs. A lifetime license could cover a clearly bounded local product; it must not imply unlimited future cloud/AI expense. Preserve current free utility access and existing open-source terms. No paywall or checkout is part of this change.
