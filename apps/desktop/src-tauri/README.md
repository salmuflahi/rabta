# Rabta Tauri Shell

Thin Tauri shell crate that wraps the React desktop app. It starts the omnibus-hub on
launch and exposes it to the frontend via the `connectors` and `send_command` commands
and the `hub-event` stream.
