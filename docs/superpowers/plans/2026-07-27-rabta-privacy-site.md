# Rabta Privacy Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a public, tracker-free Rabta privacy-policy page and use its HTTPS URL in the Chrome Web Store listing.

**Architecture:** A standalone one-route Sites project renders the policy as semantic HTML with a small CSS-only local-connection motif. It has no client state, forms, analytics, cookies, external data, or runtime configuration.

**Tech Stack:** Sites starter, React, TypeScript, CSS, Cloudflare-compatible production output

## Global Constraints

- One public route containing the complete July 27, 2026 privacy policy.
- No personal contact email, analytics, cookies, forms, accounts, or remote services.
- Responsive layout, semantic headings, visible keyboard focus, and readable contrast.
- The production HTTPS URL must be entered in Chrome Web Store item `eglannhohnfalopddjbjhgiimeblmgbj`.

---

### Task 1: Build and publish the privacy page

**Files:**
- Create: `/Users/sammy/rabta-privacy-site/app/page.tsx`
- Modify: `/Users/sammy/rabta-privacy-site/app/layout.tsx`
- Modify: `/Users/sammy/rabta-privacy-site/app/globals.css`
- Modify: `/Users/sammy/rabta-privacy-site/.openai/hosting.json`

**Interfaces:**
- Consumes: The policy content in `/Users/sammy/omnibus/docs/privacy-policy.md`.
- Produces: A public HTTPS page whose visible heading is `Rabta Privacy Policy`.

- [ ] **Step 1: Initialize the standalone Sites project**

Run the Sites initializer once with `/Users/sammy/rabta-privacy-site` as its target and preserve the generated package manager, lockfile, build scripts, and hosting metadata.

- [ ] **Step 2: Replace the starter with the complete policy**

Implement semantic sections for the local-first promise, Chrome permissions, data destination, excluded practices, and local data controls. Add the static connection line:

```text
Chrome extension  ↔  127.0.0.1  ↔  Rabta desktop
```

Set the metadata title to `Rabta Privacy Policy` and description to `How Rabta's local-first desktop app and connector extensions handle data.`

- [ ] **Step 3: Verify required content and forbidden integrations**

Run:

```bash
rg -n "Rabta Privacy Policy|127\\.0\\.0\\.1|No analytics|No remote servers" app
rg -n "google-analytics|gtag|segment|mixpanel|mailto:|<form" app
```

Expected: the first command finds all required policy claims; the second produces no matches.

- [ ] **Step 4: Build the production site**

Run:

```bash
npm run build
```

Expected: exit status 0 with Cloudflare-compatible output under `dist/`.

- [ ] **Step 5: Publish the exact build**

Create the Sites project once, push the validated source state, package the built output, save one version, and deploy it publicly because the Chrome Web Store must be able to read the policy without authentication.

- [ ] **Step 6: Complete the Chrome privacy URL**

Enter the deployed HTTPS URL into the Chrome Web Store `Privacy policy URL` field, save the draft, and confirm the URL remains populated after save.

- [ ] **Step 7: Commit the implementation record**

Commit the source project in its own repository with:

```bash
git add app .openai package.json package-lock.json
git commit -m "feat: publish Rabta privacy policy"
```
