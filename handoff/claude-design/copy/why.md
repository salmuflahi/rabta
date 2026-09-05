<!-- Shipped copy of /why/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

Why Rabta
# The code is saved.
The setup isn't.
Your editor remembers the file. Git remembers the commit. Nothing
remembers the arrangement: which four files, which two terminals, which
branch, which five tabs. That is the part you rebuild by hand, every
time you come back.
A capsule is that arrangement, written down.
## Switching away is cheap. Switching back is not.
The code is exactly where you left it. The workspace around it is
gone: tabs closed, a different branch checked out, terminals
sitting in the wrong directory. Rebuilding that arrangement is
quiet, repetitive work, and no tool was doing it for you.
A capsule is the open files and their order, the terminal working
directories, the branch, the tab URLs. Save it, switch away,
resume it. The workspace comes back.
Rabta — Overview
## Rabta is رابطة: a bond, a link, the thing that ties things together.
Your editor, your terminal, your browser and git each remember their
own piece of a task. None of them remembers the arrangement. Rabta
is the bond between them, so a task can be put down and picked up
whole. The mark says the same thing in one glyph: an R whose leg is
the Arabic ر. The brand page has the whole story.
Rabta
The Latin R. The stem and the bowl: you start, you capture.
رابطة
The Arabic ر, drawn as the leg: you leave, and you come back.
## Three things that do not bend.
01
### Local-first, structurally
No server, no account, no telemetry. The hub binds to
127.0.0.1 and nothing else. There is no backend to
leak from, because there is no backend.
02
### Additive by default
Resuming opens things. It closes nothing unless you turn on focus
mode, and even then it stops at unsaved files, running terminals
and anything pinned.
03
### Honest about partial results
A restore reports per tool: restored, queued for the next reload,
or skipped with a reason. It never claims a success it did not
get.
## What it will not do.
Read the contents of your files
It stores paths. Not text, not diffs, not terminal output.
Force a checkout
A working tree that a switch would disturb refuses the switch,
with a message. Nothing is reset, stashed or discarded.
Store a GitHub credential
Issues come through your own authenticated gh CLI.
Rabta never sees a token.
Read a web page
The browser connector requests no host permissions and runs no
content scripts. It reads tab URLs and titles, and cannot read
anything else.
Phone home
v0.1.0 makes no outbound request on launch or on a timer. There is
no analytics SDK and no crash reporter.
Every claim on this page is checked against the source before it
ships. The hub's bind address is
crates/omnibus-hub/src/hub.rs; the browser connector's
permissions are its manifest.json. Both are in the public
repository.
## Leave the task. Return to all of it.
Download for macOS Read the setup guide
Free. Apple silicon, macOS 11 or later. No account, no server.
