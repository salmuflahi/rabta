# Contributing to Rabta

Thanks for looking. Rabta is a local-first macOS tool for saving and restoring
the working context around a task — the files, tabs, terminals and branch you had
open when you stopped.

## Before you open a pull request

Please open an issue first for anything beyond a small fix. Rabta has a strong
opinion about what it is — everything stays on your Mac, nothing is uploaded, and
it stores paths, URLs and branch names but never file contents, page contents or
passwords. Changes that cross those lines are unlikely to be merged however well
they are built, and it is better to find that out before you write the code than
after.

## Licensing of contributions

The project is currently released under the **MIT License** (see `LICENSE`).

By submitting a contribution you confirm that:

1. You wrote it, or you have the right to submit it under the project's licence.
2. You license your contribution to the project under the project's current
   licence, **and you agree that the copyright holder may release the project,
   including your contribution, under different licence terms in future
   versions.**

Point 2 matters and is worth being upfront about rather than burying: Rabta is a
solo project today, and the licensing of future versions has not been settled.
Anything already published stays under the licence it was published with — that
cannot be withdrawn — but later versions may be released differently. If you are
not comfortable with that, please say so in your issue or pull request before
contributing, and we will sort it out rather than surprise you later.

> **Not legal advice.** This file was drafted for clarity, not by a lawyer. If a
> contribution matters commercially to you, have your own counsel read it.

## Development

The repository is a pnpm + Cargo workspace.

```sh
pnpm install
cd apps/desktop && pnpm tauri dev     # run the app
```

Tests, all of which should pass before you open a pull request:

```sh
cargo test -p rabta-db
cargo test -p rabta-desktop
cd apps/desktop && pnpm test && pnpm exec tsc -b --noEmit
```

Please run both the test suite **and** the typechecker. They catch different
things, and a green suite with a red typechecker has slipped through here before.

## Style

Match the surrounding code — its comment density, naming and idioms. Copy in the
user interface is sentence case, no exclamation marks: name what is true, then
what to do about it, and never claim more than the software does.
