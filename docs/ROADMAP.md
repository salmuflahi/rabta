# Rabta — what happens next

**As of 11 August 2026.** Rabta 0.1.0 is public, signed and notarized. The site
is live on all eight pages. The connectors are published at 0.1.0 on the Visual
Studio Marketplace, Open VSX and the Chrome Web Store, with 0.2.0 built and
waiting.

This is the plan for the next three releases. It is ordered by what unblocks the
most, not by what is most interesting to build.

A note on the shape of it: **no dates**. Every date in a solo project's roadmap
is a promise made by someone who does not know what next month looks like.
What is here instead is sequence, size, and the specific thing that has to be
true before each item can start. `/roadmap/` on the site says the same, in
public, for the same reason.

---

## Now — 0.1.1 · the honesty release

Small, entirely made of things that are already known to be wrong or missing.
Nothing here is a feature. This is the release that closes the gap between what
ships and what the site says ships.

| # | Item | Size | Blocked on |
|---|---|---|---|
| 1 | ~~Publish connectors 0.2.0~~ | done | Open VSX and Marketplace live; Chrome in review. |
| 2 | ~~Re-shoot the Overview screenshot~~ | done | All six shots now come from the real app. |
| 3 | ~~Claim the Open VSX namespace~~ — **filed [#12484](https://github.com/EclipseFdn/open-vsx.org/issues/12484)** | done | Awaiting a maintainer. |
| 4 | ~~Instagram and TikTok in the footer~~ | done | — |
| 5 | ~~Bump the site to the published connector version~~ | done | — |

### On the namespace claim

Two claims are already closed on the Open VSX tracker
([#12127](https://github.com/EclipseFdn/open-vsx.org/issues/12127),
[#12325](https://github.com/EclipseFdn/open-vsx.org/issues/12325)), both for
lack of response. Both times the maintainer asked the same question and never
got an answer: *prove this GitHub ID has write access to the Marketplace
publisher account.*

That proof exists now and did not obviously exist then:

- `rabta-connect` is a Visual Studio Marketplace publisher flagged **verified**.
- It publishes `rabta-connect.rabta-vscode`, whose `package.json` declares
  `github.com/salmuflahi/rabta`.
- That repository is owned by `salmuflahi` — the account filing the claim.

[#12484](https://github.com/EclipseFdn/open-vsx.org/issues/12484) says exactly
that, in that order. It also does the thing both earlier attempts missed: the
template requires a *sub-choice* under Option 1 and a filled-in **Claim
evidence** section, and warns in its own preamble that without them "your
request will not be approved." Neither closed issue had either. This one ticks
"the extension repo is owned by the GitHub ID making this request", names the
repo, and links a commit by that ID to the exact `package.json` the Marketplace
listing declares.

Nothing to do now but wait for a maintainer.

**Unverified is not broken.** The extension installs normally. The listing
carries no publisher badge, which is a trust signal on a product whose entire
argument is trust — which is why it is on the list at all, and why it is not
urgent.

---

## Next — 0.2.0 · reach

The release that lets people run Rabta who currently cannot.

**Intel and universal builds.** The single largest group of people who cannot
run Rabta today are on Intel Macs, and the reason is packaging rather than
architecture — nothing in the app is deliberately arm64-specific. A universal
binary roughly doubles the DMG; `/setup/`, `/faq/`, the homepage requirement
line and the JSON-LD all name Apple silicon and would need revising together.
*Sizeable. Start here.*

**Focus mode's close half, in the app.** The connectors can already do it —
`tabs.close`, `editor.closeFile`, `terminal.dispose` are what 0.2.0 of the
connectors is. The desktop side that drives them is the work. The rule that
makes focus mode trustworthy is that it never closes an unsaved file, a running
terminal, or anything pinned, and that rule has to hold in the app, not in the
connector. *Medium. Needs the connectors published first, or it cannot be
tested against anything real.*

**Agents that read, capture and restore.** `@rabta/mcp` is built: five
read-only tools over the app's own database (a briefing an agent can load as
context, the capsule as data, the recent activity) and two that ask the running
app to capture or restore, through Agent access, a switch in Settings that
opens an owner-only socket file and closes it again. The site's `/agents/` page
describes it. *Ships with the next release; the npm publish and the store
copy are the remaining steps.*

**Bulk multi-select on capsules.** Archiving or deleting several as one gesture.
The list already has selection-follows-focus; multi-select changes what "the
selected capsule" means everywhere downstream, which is the actual cost.
*Medium. Independent of everything else here.*

**Windows or Linux — decide, don't drift.** macOS is the only tested target.
Nothing is deeply macOS-specific except the discovery file and the
keychain-adjacent parts. This is on the list as a *decision*, not a task: either
commit to a second platform and take the testing burden, or say publicly that
macOS is the target. Drifting between the two is the only wrong answer.

---

## Later — 0.3.0 · surface

Only after the two above, and only if 0.2.0 stays stable.

**Auto-update.** It needs an update endpoint and a signing keypair separate from
the Apple certificate. It would also be **the first thing in Rabta that makes an
outbound request on its own** — every network call today is behind a click. That
is a real change to the product's central claim, so it gets designed in the open
and documented on `/privacy/` before it is built, or it does not get built.

**More connectors** — Docker, Postman, Figma, Linear, Jira. Each is a protocol
conversation, not a plugin drop. Four done badly is worse than none.

**A plugin SDK and automation rules.** Worth doing once the protocol has stopped
moving. Publishing an SDK against a moving target is a promise you then break.

**Cloud sync and team collaboration.** Opt-in only, and only if they can meet the
local-first bar. Anything that would send data off the machine is off by default
and asks first.

---

## Standing work — not a release

Things that should happen on a rhythm rather than in a version.

- **`node scripts/verify-registries.mjs` before every release.** It exists
  because the site claimed for a fortnight that the Marketplace listing did not
  exist while it did — and a test *required* that claim, so the falsehood was
  load-bearing. No static test can catch that class; only asking the registry
  can.
- **`cargo audit` in CI.** Currently manual. Zero vulnerabilities today is a
  snapshot, not a property.
- **Re-run the security audit at each minor release.**
  [docs/SECURITY-AUDIT-2026-08.md](SECURITY-AUDIT-2026-08.md) is true of 0.1.0
  and says so; it is not a certificate.
- **Keep the cross-page guards growing.** Every site defect worth fixing so far
  has been a factual contradiction between pages, and every one was mechanically
  checkable.

---

## Deliberately not planned

Kept here so the answer is written down rather than re-litigated:

- **A contact form.** The site's CSP sets `form-action 'none'` and it is static
  on GitHub Pages. Any working form needs a third-party service, which puts a
  request to someone else's server on a site whose privacy page says there are
  none. `mailto:` and GitHub issues cost nothing and claim nothing.
- **Analytics.** There is no version of this that is compatible with the
  homepage.
- **A paid tier, while the roadmap above is unfinished.** "Free while in beta"
  implies a price later; the site says MIT and free, which is the commitment.

---

## Sequencing, in one line

**Intel build → focus mode's close half → decide on Windows.**

0.1.1 is done. Every item on it is either shipped or waiting on someone else —
the Chrome review and the Eclipse namespace claim. Nothing on the site has
anything left to apologise for, which was the point of the release. Start
anything in 0.2.0.
