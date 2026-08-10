# Rabta Desktop

The Rabta desktop app and dev console, built with React, TypeScript, Tauri, and Tailwind CSS. Run `pnpm --filter desktop tauri dev` to start development mode, or `pnpm --filter desktop build` to typecheck and build the production bundle.

## Dev data directory

`pnpm tauri dev` runs against a separate `…/com.omnibus.dev.debug` data directory instead of the release app's `…/com.omnibus.dev` directory. Both directories are derived from the same bundle identifier, so without this split a debug run would open the exact same database and hub state as an installed release build. Dev runs always start from an empty database and can never touch the installed app's data.
