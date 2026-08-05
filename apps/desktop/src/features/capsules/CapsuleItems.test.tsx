import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapsuleItems } from "./CapsuleItems";

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
        pins={[{ connectorKind: "chrome", identity: "https://a.test/" }]}
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
});
