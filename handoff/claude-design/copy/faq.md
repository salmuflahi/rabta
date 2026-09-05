<!-- Shipped copy of /faq/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

FAQ
# The questions the docs answer sideways.
Short answers, with a link to the long one where there is a long one.
Every answer is checked against the source before it ships; where a thing
is not built yet, this page says so rather than implying it is.
Applies to Rabta 0.1.0
## Getting it onto the machine.
### Does Rabta run on an Intel Mac?
No. v0.1.0 is an arm64-only build for Apple silicon, macOS 11 or
later. There is no Intel and no universal build yet: it is on the
roadmap as packaging work rather than a
rewrite.
### Will Gatekeeper block it?
No. The app is signed with an Apple Developer ID and notarized,
with the ticket stapled to the DMG, so it opens on a normal
double-click. If you do see a warning, the file you have
is not the one that was signed: check the SHA-256 on the
setup page and download again rather
than bypassing it.
### Which editors can connect?
VS Code, Cursor, VSCodium and Windsurf. The connector is on both
registries, the Visual Studio Marketplace and Open VSX, so
whichever of the four you use, searching the Extensions panel for
Rabta Connector finds it. The
setup guide has the steps.
### Do I need the browser extension?
No. Capsules capture and restore editor files, terminals and the
Git branch either way. Without it, tabs are reported as
unavailable rather than failing the restore; add it later and
existing capsules start capturing tabs too.
### What does it cost?
Nothing. It is free and MIT-licensed, and the whole thing is on
GitHub
if you would rather read it than trust it.
## What it does with your work.
### What is actually in a capsule?
Open file paths and their workspace folder, terminal working
directories, browser tab URLs and titles, and the Git branch name.
Pointers, not contents.
### Does it save my work for me?
No. Rabta records where things were, not what was in
them. Your editor still saves your files; Git still holds your
history. If Rabta vanished, nothing you wrote would go with it.
### Does resuming close my other work?
Not by default. Focus mode is opt-in. With it on, resuming also
closes what the capsule did not capture: one item at a time, only
after the restore itself finishes cleanly, and never an unsaved
file, a running terminal, or anything pinned.
### What happens if my working tree is dirty?
The branch switch is refused with a message saying why. Rabta
never force-checkouts, resets, stashes or discards.
### What if an app is not running when I resume?
That tool is reported as queued for the next reload, not as a
failure. The summary is per tool and says what happened to each
one, so a partial result reads as partial.
## What it can and cannot reach.
### Is there an account?
No, and there is no server to have one on. The hub binds to
127.0.0.1 and nothing else.
### Does Rabta read my code?
No. It records which files were open, never what is in them: and
never terminal output, keystrokes, clipboard or page contents.
### Can the browser extension read the pages I'm on?
No, and not by policy: by permission. Its manifest declares only
tabs, storage and alarms,
requests no host permissions, and runs no content scripts. Chrome
itself makes page contents, form data and cookies unreachable to
it. Incognito tabs and anything that isn't http(s) are excluded
before they reach the wire.
### Does it phone home?
No. v0.1.0 makes no outbound request on launch or on a timer.
There is no analytics SDK and no crash reporter. Two things in the
app can reach the network at all, and each only when you click it:
the Git menu's Fetch, and the optional GitHub issue features,
which run your own gh CLI. Nothing else opens a
network socket. Agent access, if you turn it on in Settings,
listens on a local Unix socket inside the data folder: a file on
disk, not a port.
### Does it store my GitHub token?
No. The GitHub features shell out to your own authenticated
gh CLI. Rabta never sees, stores or transmits a
token.
### Where is my data, and how do I delete it?
One folder:
~/Library/Application Support/com.omnibus.dev. Delete
it and everything is gone: there is no copy anywhere else. Full
detail on the privacy page.
## Living with it.
### Is there an auto-updater?
No. v0.1.0 makes no outbound request on launch or on a timer, and
that includes checking for a new version. A new release is
something you choose to come back and download.
### Windows or Linux?
macOS is the only tested target today. Nothing is deeply
macOS-specific, but the discovery file and the keychain-adjacent
parts would need porting.
### Something not answered here?
Get in touch. Bugs and feature requests
are better as issues: they stay visible to everyone else who hits
the same thing.
