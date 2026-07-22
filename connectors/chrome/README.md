# Rabta Chrome Connector

The browser connector that pairs this browser with the local Rabta hub. Connects via task 10a's handshake protocol and stores its hub token in `chrome.storage.local`.

## Build

```bash
pnpm --filter rabta-chrome build
```

## Load into Chrome

```bash
open -a "Google Chrome" --args --load-extension=$PWD/connectors/chrome
```

## Privacy

The connector captures only HTTP/HTTPS tab URLs and titles—never page content, and never tabs from incognito sessions. All other schemes (chrome://, file://, extension pages, javascript:) are filtered out at capture and restore.

## Test

```bash
pnpm --filter rabta-chrome test
```
