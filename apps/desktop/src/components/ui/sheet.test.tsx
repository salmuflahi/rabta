import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { Sheet } from "./sheet";

function renderSheet(props: Partial<React.ComponentProps<typeof Sheet>> = {}) {
  const onOpenChange = vi.fn();
  const primaryClick = vi.fn();
  const view = renderWithProviders(
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="Send to another Mac"
      subtitle="Nothing is removed from this Mac."
      step={{ current: 2, total: 4 }}
      primary={{ label: "Continue", onClick: primaryClick }}
      {...props}
    >
      <p>body</p>
    </Sheet>,
  );
  return { ...view, onOpenChange, primaryClick };
}

/** Mirrors App.tsx: a bubble-phase listener on `window`, which is what
 * every global shortcut in this app is bound to. Hoisted to module scope
 * (rather than living only inside `describe("Sheet keyboard")`) so the
 * `enterAdvances` block can reuse it for its own regression test below. */
function spyOnGlobalShortcuts() {
  const seen: string[] = [];
  const handler = (e: KeyboardEvent) => seen.push(e.key);
  window.addEventListener("keydown", handler);
  return { seen, stop: () => window.removeEventListener("keydown", handler) };
}

describe("Sheet", () => {
  it("renders its title, subtitle, body and step counter", () => {
    renderSheet();
    expect(screen.getByText("Send to another Mac")).toBeInTheDocument();
    expect(screen.getByText("Nothing is removed from this Mac.")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("offers Back only when there is somewhere to go back to", () => {
    const first = renderSheet();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    first.unmount();

    renderSheet({ onBack: vi.fn() });
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("cancels through onOpenChange rather than a second close path", () => {
    const { onOpenChange } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders no primary when a step has no forward action", () => {
    renderSheet({ primary: null });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  // Anchored to the top and rounded only at the bottom: it comes out from
  // under the titlebar rather than floating near it.
  it("is a top-anchored sheet, not a centred dialog", () => {
    const { container } = renderSheet();
    const sheet = document.querySelector("[data-sheet]") as HTMLElement;
    expect(sheet).not.toBeNull();
    const classes = sheet.className.split(/\s+/);
    expect(classes).toContain("top-0");
    expect(classes).toContain("rounded-b-[12px]");
    expect(classes).toContain("w-[620px]");
    expect(classes).toContain("max-h-[84vh]");
    expect(container).toBeTruthy();
  });
});

describe("Sheet keyboard", () => {
  // "When the Migrate sheet is open it swallows all keys — esc closes,
  // enter advances, nothing else fires." Without this, ⌘S mid-transfer
  // captures a capsule and ⌘1 navigates the window out from under a
  // half-finished migration.
  it("stops global shortcuts from firing while it is open", () => {
    const spy = spyOnGlobalShortcuts();
    try {
      renderSheet();
      fireEvent.keyDown(document.body, { key: "k", metaKey: true });
      fireEvent.keyDown(document.body, { key: "s", metaKey: true });
      fireEvent.keyDown(document.body, { key: "1", metaKey: true });
      expect(spy.seen).toEqual([]);
    } finally {
      spy.stop();
    }
  });

  it("lets global shortcuts through again once it is closed", () => {
    const spy = spyOnGlobalShortcuts();
    try {
      const { unmount } = renderSheet();
      unmount();
      fireEvent.keyDown(document.body, { key: "k", metaKey: true });
      expect(spy.seen).toEqual(["k"]);
    } finally {
      spy.stop();
    }
  });

  it("advances on Enter", () => {
    const { primaryClick } = renderSheet();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(primaryClick).toHaveBeenCalledTimes(1);
  });

  it("does not advance on Enter when the primary is disabled", () => {
    const primaryClick = vi.fn();
    renderSheet({ primary: { label: "Continue", onClick: primaryClick, disabled: true } });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(primaryClick).not.toHaveBeenCalled();
  });

  // A focused button owns Enter. Advancing the sheet as well would fire two
  // things from one keypress.
  it("leaves Enter to a focused control", () => {
    const { primaryClick } = renderSheet();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });
    expect(primaryClick).not.toHaveBeenCalled();
  });

  // Escape belongs to Radix, which closes the sheet — the swallow must not
  // eat it.
  it("leaves Escape alone", () => {
    const { onOpenChange } = renderSheet();
    fireEvent.keyDown(document.querySelector("[data-sheet]")!, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("enterAdvances", () => {
  it("fires the primary on Enter by default", () => {
    const onPrimary = vi.fn();
    renderWithProviders(
      <Sheet open onOpenChange={() => {}} title="T" primary={{ label: "Go", onClick: onPrimary }}>
        body
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPrimary).toHaveBeenCalled();
  });

  // The pairing sheet's core safety property: a security decision must never
  // be reachable by a keypress that was already in flight.
  it("fires nothing on Enter when enterAdvances is false", () => {
    const onPrimary = vi.fn();
    renderWithProviders(
      <Sheet
        open
        onOpenChange={() => {}}
        title="T"
        enterAdvances={false}
        primary={{ label: "Approve", onClick: onPrimary }}
      >
        body
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPrimary).not.toHaveBeenCalled();
  });

  // Regression guard on the mechanism, not just the visible outcome: Enter
  // must be swallowed unconditionally, so no global shortcut can fire
  // either. event.stopPropagation() has to run outside the enterAdvances
  // guard — if a future edit moved it inside that guard, this is the only
  // test that would catch it. The test above would keep passing (the
  // primary still wouldn't fire) while a global shortcut fired on the same
  // keypress, reopening exactly the hole enterAdvances exists to close on
  // the pairing sheet's unprompted, unread approval.
  it("also keeps global shortcuts suppressed on Enter when enterAdvances is false", () => {
    const onPrimary = vi.fn();
    const spy = spyOnGlobalShortcuts();
    try {
      renderWithProviders(
        <Sheet
          open
          onOpenChange={() => {}}
          title="T"
          enterAdvances={false}
          primary={{ label: "Approve", onClick: onPrimary }}
        >
          body
        </Sheet>,
      );
      fireEvent.keyDown(document, { key: "Enter" });
      expect(onPrimary).not.toHaveBeenCalled();
      expect(spy.seen).toEqual([]);
    } finally {
      spy.stop();
    }
  });
});

describe("secondary action", () => {
  it("renders and fires a secondary button", () => {
    const onSecondary = vi.fn();
    renderWithProviders(
      <Sheet
        open
        onOpenChange={() => {}}
        title="T"
        secondary={{ label: "Deny", onClick: onSecondary, tone: "bad" }}
        primary={{ label: "Approve", onClick: () => {} }}
      >
        body
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onSecondary).toHaveBeenCalled();
  });

  it("renders no secondary when not given one", () => {
    renderWithProviders(
      <Sheet open onOpenChange={() => {}} title="T" primary={{ label: "Go", onClick: () => {} }}>
        body
      </Sheet>,
    );
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
  });

  // Task 5 holds both Approve and Deny inert while the pairing sheet arms —
  // this is load-bearing for that, not incidental, unlike primary.disabled
  // which already had coverage.
  it("disables a secondary action and does not fire it when clicked", () => {
    const onSecondary = vi.fn();
    renderWithProviders(
      <Sheet
        open
        onOpenChange={() => {}}
        title="T"
        secondary={{ label: "Deny", onClick: onSecondary, tone: "bad", disabled: true }}
        primary={{ label: "Approve", onClick: () => {} }}
      >
        body
      </Sheet>,
    );
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny).toBeDisabled();
    fireEvent.click(deny);
    expect(onSecondary).not.toHaveBeenCalled();
  });
});
