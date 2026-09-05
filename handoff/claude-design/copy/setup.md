<!-- Shipped copy of /setup/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

Setup
# Install Rabta and save your first capsule.
Everything here applies to Rabta 0.1.0 on macOS. It takes a few minutes,
and none of it involves creating an account.
11 sections · install · verify · connect · troubleshoot · uninstall
On this page
What you need
Install the app
Verify the download
Connect your editor
The browser connector
Pairing and permissions
Your first capsule
Troubleshooting
Logs and diagnostics
Uninstall and remove data
Report a bug
## What you need
macOS 11.0 (Big Sur) or later.
An Apple Silicon Mac (M1 or newer). Rabta 0.1.0 is an
arm64-only build: there is no Intel build and no universal build, so it
will not run on an Intel Mac.
An editor Rabta can connect to: Cursor, VSCodium,
Windsurf or VS Code.
A git repository you want to work in. Rabta reads its
path and branch, and never writes to your files itself. The one thing
that changes your working tree is the branch switch Resume performs,
and it stops rather than force one: see
section 7.
Not sure which Mac you have: Apple menu › About This Mac.
"Chip: Apple M…" means Apple Silicon.
## Install the app
Download
Rabta_0.1.0_aarch64.dmg
(5.5 MB).
Double-click the DMG to mount it.
Drag Rabta onto the Applications
shortcut in the window that opens.
Eject the mounted disk image.
Open Rabta from Applications, Spotlight or Launchpad.
Rabta opens on the Overview screen and starts its local hub straight away.
The hub binds to 127.0.0.1 on port 17872 when
that port is free, and to another local port when it isn't.
### What Gatekeeper will do
The app is signed with an Apple Developer ID and notarized by Apple, with
the notarization ticket stapled to the DMG. In practice:
It opens with a normal double-click. You should not
need to right-click › Open, and you should not see an "unidentified
developer" or "Apple could not verify" warning.
The first launch may pause briefly while macOS checks the signature.
That is normal and happens once.
macOS may ask whether to allow Rabta to accept incoming network
connections. That is the local hub binding to loopback. Allowing it is
what lets your editor connect; nothing is exposed beyond your machine.
If you do get a Gatekeeper warning, don't work around it: it
means the file you have is not the one that was signed. Check the
SHA-256 below, and download again if it doesn't match.
## Verify the download
Optional, and worth doing. All of it is checkable from the file itself.
### Checksum
# from wherever you saved it
shasum -a 256 ~/Downloads/Rabta_0.1.0_aarch64.dmg
# expected
3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655
Copy checksum
### Signature and notarization
# the stapled notarization ticket
xcrun stapler validate ~/Downloads/Rabta_0.1.0_aarch64.dmg
# -> The validate action worked!
# what Gatekeeper itself thinks
spctl -a -vv -t install ~/Downloads/Rabta_0.1.0_aarch64.dmg
# -> accepted, source=Notarized Developer ID : these are terms and their
definitions, and a screen reader should hear them paired. -->
Team ID
86M2X6MUA3
Bundle ID
com.omnibus.dev
Identity
Developer ID Application: sammy almuflahi (86M2X6MUA3)
Why the bundle id says &#8220;omnibus&#8221;. Rabta was
called Omnibus before release, and com.omnibus.dev is the
identifier it shipped under. It is deliberately unchanged: macOS uses
the bundle id to locate an app&#8217;s data, so renaming it would orphan
the capsules of anyone who installed an early build. It is the same
folder referenced throughout this page and in the
privacy policy.
## Connect your editor
The extension is published as Rabta Connector
(rabta-connect.rabta-vscode, version 0.2.0) on both
registries: the
Visual Studio Marketplace,
which stock VS Code reads, and
Open VSX,
which Cursor, VSCodium and Windsurf read. Whichever you
use, it is in the Extensions panel.
0.2.0 raises the editor floor from VS Code
1.85 to 1.93. Busy-terminal detection
needs shell-execution events that are only stable from 1.93, and there
is no fallback. On an older editor the registry keeps offering you
0.1.0 rather than failing, which is the correct behaviour but is worth
knowing before you go looking for a version you cannot see.
### Any of the four editors
Search and install, the same way in each:
Open the Extensions panel (⇧⌘X).
Search for Rabta Connector.
Install it, then reload the window.
Or from a terminal, with whichever binary you have:
code --install-extension rabta-connect.rabta-vscode
# or
cursor --install-extension rabta-connect.rabta-vscode
### Installing the file directly
Not the normal route any more &mdash; both registries serve it &mdash;
but useful on a machine that cannot reach one of them, or to pin a
specific version:
Download
rabta-connect.rabta-vscode-0.2.0.vsix
from Open VSX.
Install it:
code --install-extension ~/Downloads/rabta-connect.rabta-vscode-0.2.0.vsix
or use Extensions panel › … › Install from VSIX…
Reload the window.
The .vsix itself carries no code signature: VS Code
extensions are not signed artefacts the way the macOS app is. Download
it from Open VSX rather than from a third party.
### What happens next
On the next editor start the extension activates on its own, reads the
hub's per-run secret from a local discovery file, and connects. There is
nothing to sign into and no token to paste. It appears as a
vscode connector in Rabta's Connectors view.
The extension never blocks editor startup. If Rabta isn't running it stays
idle and connects later.
## The browser connector
Install Rabta Connector from the
Chrome Web
Store. It pairs with the local hub on first run, the same way the
editor connector does: there is nothing to configure.
Rabta is usable without it. Capsules capture and restore your editor
files, terminals and git branch either way; without the browser connector,
tabs are reported as unavailable rather than failing the restore. Add it
later and existing capsules start capturing tabs too.
The extension reads only tab URLs and titles, for
http/https non-incognito tabs. It requests no host permissions and runs no
content scripts, so it is structurally unable to read page contents.
## Pairing and permissions
Rabta has two different trust paths, because the two connectors sit in
different places.
### Editor connector: automatic, local
Your editor runs on the same machine under your user account, so it can
read the hub's discovery file
(~/Library/Application Support/com.omnibus.dev/hub.json),
which holds the port and a secret regenerated every time the app starts.
That is the whole handshake: no prompt, no account.
### Browser connector: you approve it
A browser extension cannot read that file, so it asks instead. On first
connection Rabta shows an approve/deny prompt in the
Connectors view naming the connector. Nothing is captured
or sent until you press Approve. The extension then
remembers its token across restarts.
### macOS permissions
Incoming network connections: macOS may ask on first
launch. This is the loopback hub. Allow it, or connectors cannot reach
the app.
Rabta 0.1.0 does not request Full Disk Access, Accessibility, Screen
Recording, Camera, Microphone or Contacts.
## Your first capsule
### Register a project
Go to Projects › Register Project.
Choose the folder of a git repository.
Rabta reads the path and current branch. Optionally add a dev URL (for
example http://localhost:3000) and an icon.
### Create a task
Go to Capsules.
Under your project, type what you're working on into
New task title and press Add Task.
A task is just a name for the thing you're doing. Its capsule is the
workspace that belongs to it.
### Save the capsule
With your files and terminals open in the connected editor, press
Save State on the task. Rabta records which files,
terminals, tabs and branch are in play: the pointers, not the contents,
and tells you what it captured and what it skipped.
### Switch away
Resume a different task, or just close things down. Activating another task
auto-saves the one you're leaving, so you rarely have to
remember to press Save State.
### Resume
Press Resume on the task. Rabta reopens the workspace
folder, files and terminals in your editor, puts you back on the task's
branch, and reopens its tabs if the browser connector is connected. A
summary sheet reports the outcome per tool:
Restored: the tool confirmed it applied.
On next reload: the tool isn't connected right now,
so it's queued rather than failed.
Skipped or Failed, with the reason. A
restore never claims a success it didn't get.
Branch restores are deliberately cautious. If your working tree is dirty
in a way a checkout would disturb, Rabta stops and tells you rather than
forcing the switch.
## Troubleshooting
### The app won't launch
"You can't open this application because it is not supported
on this Mac.": you're on an Intel Mac. Rabta 0.1.0 is Apple
Silicon only.
A Gatekeeper warning appears. The file has been
altered or truncated. Verify the SHA-256 in
section 3 and download again if it doesn't match.
Don't bypass the warning.
It bounces once and quits. Move Rabta into
/Applications rather than running it from the mounted disk
image or Downloads, then try again.
### The editor connector never connects
In order:
Is Rabta running? The connector only connects while
the app is open. Start Rabta, then reload the editor window.
Did you reload the editor after installing the
extension? It activates on startup.
Does the discovery file exist?
cat ~/Library/Application\ Support/com.omnibus.dev/hub.json
It should print a port and a secret. If it's missing, the hub didn't
start: check that you allowed incoming connections when macOS asked.
Is something else on the port? The hub prefers
17872 and falls back to another local port when it's taken.
The port it actually bound is shown in the app header and in
hub.json.
lsof -nP -iTCP:17872 -sTCP:LISTEN
Check Activity. If the connector reached the hub at
all, there will be a connectorConnected event with a
timestamp.
### The connector connects, then drops
The secret in hub.json is regenerated every time the app
starts: that's deliberate, it's the local trust boundary. If you quit
and reopen Rabta, reload your editor window so the extension re-reads it.
Connectors seen before stay listed as offline rather than disappearing, so
you can tell "not installed" from "not running".
### Version mismatch
The Connectors view shows each connector's version beside its name. The app
and connectors are released together, and 0.1.0 expects 0.1.0. If they
differ:
Update the extension from
Open VSX,
or reinstall the matching .vsix, so it matches the app.
Reload the editor window afterwards.
If a capability the app expects is missing, the Restore summary reports
that tool as skipped with a reason rather than failing the whole
restore.
### A restore didn't bring everything back
Read the summary sheet: it is per tool and specific. The two usual causes
are a tool that wasn't connected at restore time (queued, applies on next
reload) and a branch switch Rabta declined because the working tree was
dirty. Activity shows exactly which commands
went out and what came back.
## Logs and diagnostics
Rabta's log is in the app, not a file you have to hunt for.
Activity shows every command the hub sent to a connector
and every response and event it received, timestamped and filterable by
connector and event kind. History is read back from the local database, so
it survives restarts.
Everything Rabta stores lives in one folder:
~/Library/Application Support/com.omnibus.dev/
omnibus.db: projects, tasks, capsules and event history.
hub.json: the current port and per-run secret.
Open that folder from Settings › Privacy & data › Reveal in
Finder.
Settings › Developer › Developer mode reveals the raw
connector-command console if you want to watch the wire traffic directly.
## Uninstall and remove data
There is nothing to deauthorize and no account to close.
Quit Rabta.
Remove the app: drag
/Applications/Rabta.app to the Trash.
Remove its data, if you want it gone:
rm -rf ~/Library/Application\ Support/com.omnibus.dev
That deletes every capsule, project, task and event Rabta stored. It
cannot be undone, and there is no copy anywhere else.
Uninstall the editor extension from your editor's
Extensions panel.
Removing individual pieces works too: delete a capsule from Capsules, or
archive a project from Projects. Your repositories, files and branches are
never touched by any of this: Rabta only ever stored pointers to them.
## Report a bug
Open an issue at
github.com/salmuflahi/rabta/issues,
or email support@rabta.build.
What helps most:
Your macOS version and Mac model.
Rabta's version (0.1.0) and the connector version from Connectors.
Which editor, and how you installed the extension.
What you expected to come back and what actually did: the Restore
summary wording is useful here.
The relevant rows from Activity around the failure.
Activity rows can contain file paths and tab URLs from your own work.
Have a look before pasting them into a public issue.
