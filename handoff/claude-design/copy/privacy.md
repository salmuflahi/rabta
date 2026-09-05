<!-- Shipped copy of /privacy/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

Privacy
# Privacy policy
Rabta is a local-first desktop tool. There is no Rabta server, no account
and no telemetry: so most of this policy describes things that do not
happen, and is precise about where the exceptions are.
Effective 29 July 2026 · Applies to Rabta 0.1.0 and rabta.build
12 sections · what is stored · what never leaves · how to delete it
On this page
The short version
Accounts
What Rabta stores on your machine
Your source code
Connectors and their permissions
Telemetry, crash reports, update checks
Optional GitHub features
This website
Third parties you may reach
Deleting and moving your data
Changes to this policy
Contact
## The short version
Rabta stores what it needs on your own Mac and nowhere else. It has no
backend to send data to, collects no analytics, and requires no account.
The only times anything leaves your machine are things you start yourself:
downloading the app or extension from their hosts, the optional GitHub
features, which run your own gh command-line tool, and the
Git menu's Fetch, which runs your own git binary against the
remote your repository already points at.
## Accounts
Rabta does not require an account, and does not offer one.
There is no sign-up, no login, no email address, no licence key and no
profile. Nothing you do in the app is tied to an identity, because there is
no identity to tie it to.
## What Rabta stores on your machine
Everything Rabta stores lives in a single folder on your Mac:
~/Library/Application Support/com.omnibus.dev/
Why that path says &#8220;omnibus&#8221;. Rabta was called
Omnibus before release, and com.omnibus.dev is the bundle
identifier it shipped under. It is deliberately unchanged: macOS uses the
bundle id to locate an app&#8217;s data, so renaming it would orphan the
capsules of anyone who installed an early build. It is a folder name, not
a service &#8212; nothing about it involves a third party.
Everything Rabta writes is in there, and it is a short list:
omnibus.db: a local database of your projects, tasks,
capsules and event history. Alongside it you will see
omnibus.db-wal and omnibus.db-shm: SQLite's
own journal and shared-memory files. They hold the same data mid-write,
not different data.
hub.json: the port the local hub is listening on and a
shared secret, regenerated every time the app starts.
agent.sock and agent.secret: present only
while Agent access is on in Settings. A local socket file an AI agent
on this Mac can ask to capture or restore a capsule through, and the
secret it must present first. Both are readable by your user only, and
turning the switch off removes both. Nothing about them touches the
network.
.window-state.json: the size and position of the
window, so it reopens where you left it.
### The exact categories of data stored
CategoryWhat that means
Projects A name, a repository path, an optional dev URL, the default branch, an icon choice, ordering and timestamps
Tasks A title you typed, which project it belongs to, whether it is open or done, and timestamps
Capsule resources Per task: file paths that were open, the workspace folder, the count and working directories of terminals, browser tab URLs and titles, and a git branch name
Connectors Each connector's name, kind, declared capabilities, version, when it was first and last seen, and the pairing token you approved it with: so an approved connector does not have to be re-approved on every launch. It is generated on this machine, means nothing anywhere else, and is deleted with the folder
Activity A log of commands sent to connectors and the responses and events received, with timestamps
Session timing How long a project was active, counted on your machine
Preferences Theme, motion setting, landing page and similar UI choices, in the app's local storage
None of this is transmitted anywhere. It is written to your disk, read back
by the app, and gone when you delete it.
## Your source code
Rabta does not read the contents of your files, and does not upload
them.
A capsule records which files were open, their paths, not what
is in them. The editor extension does not read document text, and the app
has no code that opens your project files for their contents. The same goes
for terminals: Rabta records that terminals existed and their working
directories, never their scrollback or output. For the browser it records
tab URLs and titles, never page contents.
Rabta does read your repository's git metadata: current branch,
branch list, whether the working tree is dirty, how many files changed: by
running your own git binary. It does not read the diffs
themselves, and it sends none of it anywhere.
## Connectors and their permissions
### Editor connector (Cursor, VSCodium, Windsurf, VS Code)
Runs inside your editor and connects to the Rabta app on
127.0.0.1. It reports which files, workspace folder and
terminals are open, and reopens them on request. It authenticates by
reading the local hub.json secret, a file only processes
running as you can read. It sends nothing to any other destination.
### Browser connector (Chrome)
Published on the Chrome Web Store. It requests three permissions, and no
host permissions at all:
tabs: to read the URLs and titles of open http/https,
non-incognito tabs, so they can be snapshotted into a capsule and
reopened later.
storage: to hold the pairing token that lets it talk to
the Rabta app.
alarms: to keep the local connection alive.
It requests no host permissions and runs no content scripts, so it is
structurally unable to read page contents. It connects only after you press
Approve in the Rabta app, and its only destination is the
Rabta app on the same computer.
## Telemetry, crash reports, update checks
Telemetry: none. Rabta 0.1.0 contains no analytics
SDK, no usage pings, no event reporting and no advertising code.
Crash reporting: none. There is no crash reporting
service. A crash produces whatever macOS records locally, and nothing is
sent to us.
Update checks: none. Rabta 0.1.0 has no auto-updater
and does not check for new versions. It makes no outbound request on
launch or on a timer. A new version is something you choose to come back
and download.
## Optional GitHub features
Rabta can list a project's open GitHub issues and start a task from one.
This does nothing unless you already have the GitHub CLI (gh)
installed and authenticated, and it works by running your own
gh binary with a fixed set of arguments.
When you use it, gh contacts GitHub on your behalf with your
existing GitHub credentials. Rabta never sees, stores or transmits those
credentials. This and the Git menu's Fetch are the two places where
something you do in the app can produce a network request to a third
party, so both are worth knowing about: even though each request is made
by a tool you installed and configured yourself.
Fetch runs git fetch --all, which contacts the remote your
repository already points at and updates its remote-tracking refs. It
never merges, and it sends nothing about your machine that a
git fetch you typed yourself would not.
## This website
rabta.build makes no request beyond loading its own files.
No analytics, no counter, no tag manager, no advertising or tracking
pixel, no hosted-font request, no embedded video player, no chat widget.
Fonts, styles, scripts, images and the product loops are all served from
this domain, and the page's security policy forbids a connection to any
other.
Cookies: none. The site sets no cookies and uses no
local or session storage.
Forms: none. There is nothing here to sign up for and
no field that collects personal data.
Server logs. This is a static site served by a web
host. As essentially all web hosts do, that host may keep standard access
logs, typically IP address, user agent, requested path and timestamp,
for operational and security purposes. Those logs belong to the host, are
not forwarded to us, and are not combined with anything else or used to
build a profile.
## Third parties you may reach
Following a link takes you to someone else's service, which has its own
privacy policy and will see the request:
GitHub: hosts the macOS download, the release notes
and the issue tracker. Downloading the DMG is a request to GitHub.
Open VSX: hosts the editor extension for Cursor,
VSCodium and Windsurf. Installing it from your editor, or downloading
the .vsix, is a request to Open VSX.
Visual Studio Marketplace: hosts the same editor
extension for stock VS Code. Installing it there is a request to
Microsoft.
Chrome Web Store: hosts the browser extension.
Installing it is a request to Google.
These are ordinary software distribution channels. We receive no data about
you from them beyond the public counters they show everyone.
## Deleting and moving your data
### Deleting
Delete a single capsule or task from the Capsules
view.
Archive or delete a project from the Projects view.
Delete everything by removing the data folder:
rm -rf ~/Library/Application\ Support/com.omnibus.dev
Uninstalling the app and the extension removes the rest.
Because nothing was ever copied anywhere, deleting it locally deletes it
completely. There is no server-side copy to request the removal of and no
retention period to wait out.
### Moving it
Rabta 0.1.0 has no export command. It does not need one to be portable:
omnibus.db is an ordinary database file you can copy, inspect
or back up yourself. Open the folder from Settings › Privacy &
data › Reveal in Finder.
### Your rights
Rights like access, correction, export and erasure exist so you can act on
data somebody else is holding. Nobody else is holding any here: there is
no account, no server and no copy outside your machine: so these are all
things you can do directly and immediately with the files on your own disk.
## Changes to this policy
If Rabta's behaviour changes in a way that affects this policy: say a
future version added an update check or an optional sync feature: this
page will be updated and its effective date changed before that version
ships. Anything that would send data off your machine would be off by
default and would ask first.
## Contact
Questions about this policy, or anything above:
support@rabta.build.
Bugs and feature requests are better as
GitHub issues.
