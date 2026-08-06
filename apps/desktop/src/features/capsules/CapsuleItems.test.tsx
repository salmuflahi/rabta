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
    expect(pinButton).toBeDisabled();

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
