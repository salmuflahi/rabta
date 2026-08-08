import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapsuleItems, identityOf } from "./CapsuleItems";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

// TaskResource rows serialize camelCase — the Rust struct carries
// #[serde(rename_all = "camelCase")], same as every other record type in
// this codebase (see crates/omnibus-db/src/records.rs), and CapsulesPage.tsx
// already reads `r.connectorKind` off the real rows it gets back from
// `task_resources`. The rest of TaskResource's required fields (id, taskId,
// resourceType, createdAt) are cast away — CapsuleItems never reads them.
const resources = [
  {
    connectorKind: "chrome",
    payload: { tabs: [{ url: "https://a.test/", title: "Alpha" }] },
  },
] as never;

beforeEach(() => invoke.mockReset().mockResolvedValue(undefined));

describe("CapsuleItems", () => {
  it("pins an unpinned item", async () => {
    const onChanged = vi.fn();
    render(<CapsuleItems taskId="t1" resources={resources} pins={[]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /always open Alpha/i }));

    // run() awaits invoke() before calling onChanged(), so wait for the
    // microtask to settle rather than asserting synchronously post-click.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("pin_task_item", {
      taskId: "t1",
      connectorKind: "chrome",
      payload: { url: "https://a.test/", title: "Alpha" },
    });
  });

  it("unpins an already-pinned item", async () => {
    render(
      <CapsuleItems
        taskId="t1"
        resources={resources}
        pins={[
          {
            connectorKind: "chrome",
            identity: "https://a.test/",
            payload: { url: "https://a.test/", title: "Alpha" },
          },
        ]}
        onChanged={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /stop always opening Alpha/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("unpin_task_item", {
        taskId: "t1",
        connectorKind: "chrome",
        identity: "https://a.test/",
      }),
    );
  });

  it("removes an item from the capsule", async () => {
    render(<CapsuleItems taskId="t1" resources={resources} pins={[]} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /remove Alpha from this capsule/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remove_task_item", {
        taskId: "t1",
        connectorKind: "chrome",
        identity: "https://a.test/",
      }),
    );
  });

  // IMPORTANT 1 (defined-workspaces final review): a vscode terminal opened
  // without an explicit directory (ctrl+backtick) reports cwd: null.
  // restore_vscode on the Rust side can only recreate a terminal that has a
  // cwd, so pinning a cwd-less one would silently never fire — the item
  // must still be listed (so it can be seen and removed), but the pin
  // control itself must be disabled and explain why.
  it("disables the pin control for a vscode terminal with no known cwd", () => {
    const noCwdResources = [
      { connectorKind: "vscode", payload: { terminals: [{ name: "zsh", cwd: null }] } },
    ] as never;
    render(<CapsuleItems taskId="t1" resources={noCwdResources} pins={[]} onChanged={vi.fn()} />);

    // still listed
    expect(screen.getByText("zsh")).toBeInTheDocument();

    const pinButton = screen.getByRole("button", { name: /can.?t always open zsh/i });
    // aria-disabled, not disabled: a disabled button gets pointer-events-none from
    // the base class and leaves the tab order, so its title — the only place the
    // reason is written — could never reach anyone looking at it.
    expect(pinButton).toHaveAttribute("aria-disabled", "true");
    expect(pinButton).not.toHaveAttribute("disabled");
    expect(pinButton).toHaveAttribute("title", expect.stringMatching(/can.?t always open zsh/i));

    // Refusing the click is what makes aria-disabled honest.
    fireEvent.click(pinButton);
    expect(invoke).not.toHaveBeenCalled();

    // remove must stay fully available
    expect(screen.getByRole("button", { name: /remove zsh from this capsule/i })).toBeEnabled();
  });

  it("still allows pinning a vscode terminal that has a cwd", () => {
    const withCwdResources = [
      { connectorKind: "vscode", payload: { terminals: [{ name: "zsh", cwd: "/repo/a" }] } },
    ] as never;
    render(<CapsuleItems taskId="t1" resources={withCwdResources} pins={[]} onChanged={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^always open zsh$/i })).toBeEnabled();
  });

  // IMPORTANT 2 (defined-workspaces final review): itemsOf used to only walk
  // `resources`, using `pins` merely to decorate matches — so the headline
  // scenario (pin a tab, close it, let auto-save run) produced a curate list
  // with NO pinned rows at all: invisible and impossible to undo.
  it("shows a pinned item that is no longer in the captured payload, still marked pinned and unpinnable", async () => {
    const pins = [
      {
        connectorKind: "chrome",
        identity: "https://gone.test/",
        payload: { url: "https://gone.test/", title: "Gone" },
      },
    ];
    render(<CapsuleItems taskId="t1" resources={[]} pins={pins} onChanged={vi.fn()} />);

    // visible even though nothing captured it (label text is "Gone (not
    // open)" — a substring match, since the "not open" marker below shares
    // the same text node run as the label rather than exact-matching it)
    expect(screen.getByText(/Gone/)).toBeInTheDocument();
    // shown distinctly as not currently captured
    expect(screen.getByText(/not open/i)).toBeInTheDocument();

    // rendered pinned (unpin control present), and unpinning it works
    fireEvent.click(screen.getByRole("button", { name: /stop always opening Gone/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("unpin_task_item", {
        taskId: "t1",
        connectorKind: "chrome",
        identity: "https://gone.test/",
      }),
    );
  });

  // A pin outlives the tab or file it was made from (merge_pins on the Rust
  // side). If we stopped rendering it, the item would be "always open" on
  // every resume with no control left to stop it.
  it("still renders a pin whose item is gone, and still offers unpin", () => {
    render(
      <CapsuleItems
        taskId="task-1"
        resources={[]}
        pins={[{ connectorKind: "chrome", identity: "https://gone.test/", payload: {} }]}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("https://gone.test/")).toBeInTheDocument();
    // aria-disabled, not disabled= — a previous arc fixed exactly this so the
    // control keeps its tooltip and stays in tab order (commit c0340e9).
    const unpin = screen.getByRole("button", { name: /unpin/i });
    expect(unpin).not.toHaveAttribute("aria-disabled", "true");
  });

  // A control that cannot say why it refuses is a dead end.
  it("explains why an unpinnable terminal cannot be pinned", () => {
    render(
      <CapsuleItems
        taskId="task-1"
        resources={
          [
            { connectorKind: "vscode", payload: { terminals: [{ name: "zsh", cwd: null }] } },
          ] as never
        }
        pins={[]}
        onChanged={() => {}}
      />,
    );
    const pin = screen.getByRole("button", { name: /always open/i });
    expect(pin).toHaveAttribute("aria-disabled", "true");
    expect(pin).toHaveAccessibleDescription(/no command to reopen it/i);
  });

  // The description id used to be built from group label + index only
  // (capsule-item-pin-desc-${group.label}-${idx}), with no taskId. Two
  // different tasks' capsule popovers open at once, each with an
  // unpinnable terminal at the same group/index, would then emit the same
  // DOM id twice — and aria-describedby is id-based, so the browser
  // resolves it to whichever element happens to be first in the document,
  // silently breaking the explanation for the other task's control.
  it("qualifies the unpinnable description id by taskId, so two tasks' descriptions never collide", () => {
    const noCwdResources = [
      { connectorKind: "vscode", payload: { terminals: [{ name: "zsh", cwd: null }] } },
    ] as never;

    render(<CapsuleItems taskId="task-a" resources={noCwdResources} pins={[]} onChanged={() => {}} />);
    render(<CapsuleItems taskId="task-b" resources={noCwdResources} pins={[]} onChanged={() => {}} />);

    const pinButtons = screen.getAllByRole("button", { name: /can.?t always open zsh/i });
    expect(pinButtons).toHaveLength(2);

    const descIds = pinButtons.map((btn) => btn.getAttribute("aria-describedby"));
    // Each button must actually reference a description id, and the two
    // tasks' ids must differ.
    expect(descIds[0]).toBeTruthy();
    expect(descIds[1]).toBeTruthy();
    expect(descIds[0]).not.toBe(descIds[1]);

    // No duplicate ids anywhere in the document (the real symptom: a
    // duplicate id makes aria-describedby resolve to the wrong element).
    const allIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(allIds).size).toBe(allIds.length);

    // Each button's own accessible description still reads correctly.
    expect(pinButtons[0]).toHaveAccessibleDescription(/no command to reopen it/i);
    expect(pinButtons[1]).toHaveAccessibleDescription(/no command to reopen it/i);
  });

  it("distinguishes pinned from loose without relying on colour", () => {
    const { container } = render(
      <CapsuleItems
        taskId="task-1"
        resources={
          [
            {
              connectorKind: "chrome",
              payload: {
                tabs: [
                  { url: "https://pinned.test/", title: "Pinned Tab" },
                  { url: "https://loose.test/", title: "Loose Tab" },
                ],
              },
            },
          ] as never
        }
        pins={[{ connectorKind: "chrome", identity: "https://pinned.test/", payload: {} }]}
        onChanged={() => {}}
      />,
    );
    // The cue is an icon, not a hue — colour is never the only signal.
    expect(container.querySelectorAll("[data-pin-state='pinned']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-pin-state='loose']")).toHaveLength(1);
  });
});

// MINOR 3 (defined-workspaces final review): the Rust `identity_of` returns
// `None` for any kind other than "chrome"/"vscode" on its own. The TS
// `identityOf` used to fall through into vscode parsing for anything that
// wasn't literally "chrome" — safe only because `itemsOf` happened to
// filter to chrome/vscode before ever calling it. Exercise the function
// directly (bypassing that upstream filter) so parity with the Rust side
// doesn't depend on a caller remembering to pre-filter.
describe("identityOf", () => {
  it("returns null for a kind other than chrome or vscode", () => {
    expect(identityOf("git", { name: "whatever", cwd: "/x" })).toBeNull();
    expect(identityOf("terminal", "some/string")).toBeNull();
  });
});
