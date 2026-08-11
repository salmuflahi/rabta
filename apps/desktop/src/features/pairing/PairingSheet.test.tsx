import { act, fireEvent, screen } from "@testing-library/react";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARM_DELAY_MS, PairingSheet } from "./PairingSheet";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

// Real wire values only — `ConnectorKind` in crates/omnibus-hub/src/protocol.rs
// serializes to exactly "fake" | "vscode" | "chrome" (confirmed by reading the
// enum: `#[serde(rename_all = "lowercase")]`). Earlier versions of this file
// used "browser" / "editor", which cannot occur in production — every test
// below was exercising the component against fiction.
const chrome = { pairingId: "p1", name: "Chrome", kind: "chrome" };
const cursor = { pairingId: "p2", name: "Cursor", kind: "vscode" };
// Not a real wire value — ConnectorKind is presently closed to
// fake/vscode/chrome, so the hub itself would reject this. Exists purely to
// exercise capabilitiesForKind's forward-compatibility fallback: a kind a
// future protocol version adds, seen by a build of this app that predates it.
const mystery = { pairingId: "p3", name: "Mystery", kind: "unknown-thing" };

describe("PairingSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // `view` too, not just `pairings`: the "suppresses itself on the
    // Connectors view" test below sets `view: "connectors"` and nothing else
    // resets it, so without this line every test placed after it in file
    // order silently inherits that view and current is always undefined —
    // not a fake failure this suite happened to dodge, but a real gap that
    // bit the very first test added after it (see the queue-advance test).
    useStore.setState({ pairings: [], view: "overview" });
  });

  const arm = () => act(() => void vi.advanceTimersByTime(ARM_DELAY_MS + 10));

  it("shows nothing with no pending request", () => {
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the connector asking", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // The reason this is a sheet and not a banner: consent needs to state what
  // is being consented to.
  it("states what the connector can and cannot see", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("Can see")).toBeInTheDocument();
    expect(screen.getByText("Never sees")).toBeInTheDocument();
    expect(screen.getByText("Passwords, tokens or keychain items")).toBeInTheDocument();
  });

  // Round-2 review: the subtitle used to say "A Chrome on this Mac..." for
  // every real connector — wrong grammar (kindLabel("chrome") is "Chrome"),
  // and redundant with the title, which already names it. kindCategory
  // answers "what kind of thing is this" instead of repeating the name.
  it("describes the connector's kind in the subtitle, not its name again", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(
      screen.getByText(
        "A browser extension on this Mac is asking to talk to Rabta. Nothing is shared until you approve it."
      )
    ).toBeInTheDocument();
  });

  // The two kindCategory values need different articles — worth its own
  // test since "editor extension" is the one case that would silently read
  // "A editor extension" if the article were hardcoded instead of derived.
  it("gets the article right for a kind that starts with a vowel sound too", () => {
    useStore.setState({ pairings: [cursor] });
    renderWithProviders(<PairingSheet />);
    expect(
      screen.getByText(
        "An editor extension on this Mac is asking to talk to Rabta. Nothing is shared until you approve it."
      )
    ).toBeInTheDocument();
  });

  // Round-2 review: canSee([]) is [] — an empty "Can see" card reads as "this
  // connector sees nothing", which on a consent screen is the most
  // misleading thing it could say, and misleading in the reassuring
  // direction. capabilitiesForKind grounds the pair in what this *kind* of
  // connector actually requests, and the sheet says plainly that it's a
  // kind-level default, not this request's real declaration.
  it("shows what this kind of connector actually requests, not an empty reassuring card", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("The addresses and titles of open tabs")).toBeInTheDocument();
    expect(
      screen.getByText(
        "What browser extensions typically ask for — not what this one declared. The real list shows on Connectors once it's connected."
      )
    ).toBeInTheDocument();
  });

  // Round-2 follow-up: an empty capabilitiesForKind result now means exactly
  // one thing — a kind this build has never seen. PermissionCard would still
  // render an empty, checkmark-styled "Can see" box for that: indistinguishable
  // from "verified minimal", the same misleading-in-the-reassuring-direction
  // failure fixed once already, surviving in the one branch nobody looks at.
  // Unreachable today (ConnectorKind is a closed enum the hub itself
  // validates), but this pins the forward-compatibility fallback regardless.
  it("shows an honest unrecognized-kind message instead of an empty affirmative card", () => {
    useStore.setState({ pairings: [mystery] });
    renderWithProviders(<PairingSheet />);
    const heading = screen.getByText("Can see");
    expect(heading.className.split(/\s+/)).not.toContain("text-ok");
    expect(
      screen.getByText(
        "Rabta doesn't recognize this connector type yet, so it can't say in advance what it will ask for. The real list shows on Connectors once it's connected."
      )
    ).toBeInTheDocument();
    // "Never sees" is unaffected — its baseline line holds regardless of kind.
    expect(screen.getByText("Passwords, tokens or keychain items")).toBeInTheDocument();
  });

  it("holds both decisions inert until armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
    arm();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("does not approve on Enter, even once armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("counts the queue and advances through it", () => {
    useStore.setState({ pairings: [chrome, cursor] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // Dismissing is not deciding. A stray Escape must not permanently reject a
  // connector the user wanted — the request stays pending on Connectors.
  it("keeps the request pending when dismissed without a decision", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("suppresses itself on the Connectors view, which has its own card", () => {
    useStore.setState({ pairings: [chrome], view: "connectors" });
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Regression for a critical bug found in review: `armed` used to be state
  // that a useEffect reset on `current?.pairingId` changing. That effect
  // runs after commit, so for the render where `current` moves on to the
  // next request, the OLD request's `armed = true` was still what both the
  // `disabled` attribute and the handler guard read — item 2 inherited item
  // 1's arm state and started out clickable. This sets `pairings` to what it
  // looks like the instant item 1 is decided and removed (the same shape
  // `removePairing` produces), with no time advanced for item 2 at all.
  it("does not inherit the previous request's armed state for the next one in the queue", () => {
    useStore.setState({ pairings: [chrome, cursor] });
    renderWithProviders(<PairingSheet />);
    arm(); // chrome, item 1, is armed

    // flushSync, not act(): act() flushes a render *and* its resulting
    // effects together as one unit once its callback returns, so an update
    // made inside act() never leaves a window to inspect the render on its
    // own — by the time any assertion runs, an old effect-based `armed`
    // reset has already caught up and the bug is invisible. A real browser
    // offers no such all-or-nothing guarantee: it paints synchronously, then
    // runs `useEffect` separately, after paint — leaving a real gap a click
    // can land in. flushSync forces exactly that: the render/commit happens
    // before this call returns (confirmed below by title), but the passive
    // effect that would fix a stale `armed` is, by design, still deferred.
    flushSync(() => useStore.setState({ pairings: [cursor] })); // item 1 decided and gone
    expect(screen.getByText(/Cursor/)).toBeInTheDocument(); // item 2 is current
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });
});
