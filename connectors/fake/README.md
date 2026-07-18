# Fake VS Code Connector

A simulated VS Code connector used to validate the OmniBus architecture. This serves as a reference SDK example implementation.

## Usage

```bash
pnpm --filter fake-connector start [-- --chatty]
```

The `--chatty` flag enables periodic file-opened events for testing event flows.
