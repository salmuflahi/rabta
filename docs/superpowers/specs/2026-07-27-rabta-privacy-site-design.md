# Rabta Privacy Site Design

## Purpose

Publish a permanent, public privacy-policy URL for the Rabta Chrome Web Store
listing. The page must make Rabta's local-first data handling easy to verify
without introducing analytics, cookies, forms, accounts, or remote services.

## Page

The site has one public route. It presents:

- Rabta's local-first privacy promise.
- The Chrome extension permissions and why each is required.
- The fact that tab URLs, titles, and the local pairing token remain on-device.
- The absence of telemetry, advertising, selling, sharing, or cloud storage.
- Local data controls and the policy's July 27, 2026 update date.

The unresolved contact-email placeholder is omitted so no personal address is
published without explicit permission.

## Visual direction

Use a restrained developer-tool aesthetic: crisp near-white canvas, deep ink
text, Rabta blue accents, compact monospace labels, and a readable sans-serif
body. A subtle local-connection motif (`Chrome ↔ 127.0.0.1 ↔ Rabta`) is the
single signature element. The policy content remains the focus.

## Behavior and accessibility

The page is responsive, keyboard-readable, and usable without JavaScript. It
contains no interactive data collection. Semantic headings and high-contrast
focus states make the policy easy to navigate with assistive technology.

## Validation and delivery

The production build must complete successfully. The deployed URL must load
publicly over HTTPS and display the complete policy. That URL will be entered
in the Chrome Web Store privacy-policy field.
