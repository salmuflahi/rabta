# omnibus-hub

OmniBus local event hub: accepts connector WebSocket connections, routes commands/responses/events, and reports activity as `HubEvent`s. Can be embedded in any Rust application or run headless.

## Quick Start

Run tests:
```bash
cargo test -p omnibus-hub
```

Run headless example:
```bash
cargo run -p omnibus-hub --example headless
```
