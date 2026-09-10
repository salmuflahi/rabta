import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Room } from "./Room";
import { appendEntry, readSnapshot, readThread, storeSnapshot, type StoredSnapshot, type TeamConnection, type TeamCursor, type TeamEntry, type TeamState } from "./client";

vi.mock("./client", async importOriginal => ({ ...await importOriginal<typeof import("./client")>(), teamRequest: vi.fn(), readThread: vi.fn(), readSnapshot: vi.fn(), appendEntry: vi.fn(), storeSnapshot: vi.fn(), sendCursor: vi.fn(async () => ({ active: false })) }));
const connection: TeamConnection = { endpoint: "https://teams.example.com", roomId: "room-1", memberId: "me", memberKey: "k" };
const stored: StoredSnapshot = { hash: "a".repeat(64), author: "alina", createdAt: "2026-09-10T10:00:00Z", snapshot: { title: "Wire the reconnect", project: { id: "x", name: "Rabta" }, files: ["packages/sdk/index.ts", "apps/App.tsx"], links: ["https://example.com/docs"], folders: ["packages/sdk"], pins: [], branch: "feat/reconnect", activeFile: "apps/App.tsx", note: "Start with the sdk." } };
const entry = (over: Partial<TeamEntry>): TeamEntry => ({ hash: "h1", seq: 1, task: "reconnect", author: "alina", lamport: 1, kind: "knot", text: "", place: null, snapshot: null, target: null, to: null, parents: [], prev: null, createdAt: new Date().toISOString(), ...over });
let entries: TeamEntry[];
let state: TeamState;
const refresh = vi.fn(async () => undefined);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  entries = [
    entry({ hash: "h1", kind: "decision", text: "Ship without the banner.", lamport: 1 }),
    entry({ hash: "h2", kind: "handoff", to: "me", text: "Wire the reconnect; start in the sdk.", snapshot: stored.hash, lamport: 2, place: { type: "file", path: "packages/sdk/index.ts", line: 40 } }),
  ];
  state = {
    room: { id: "room-1", name: "Release room", createdAt: "2026-09-09T12:00:00Z" },
    me: { id: "me", displayName: "Sam", role: "member" },
    members: [{ id: "me", displayName: "Sam", role: "member", status: "working", lastSeenAt: null }, { id: "alina", displayName: "Alina", role: "owner", status: "working", lastSeenAt: null }],
    lanes: [], proposals: [], assets: [], revision: 4,
    threads: [{ id: "reconnect", title: "Wire the reconnect", entries: 2, lamport: 2, updatedAt: "2026-09-10T10:00:00Z", createdAt: "2026-09-10T09:00:00Z", lastKind: "handoff", lastAuthor: "alina", lastSnapshot: stored.hash, authors: ["alina"] }],
    inbox: [{ ...entries[1], title: "Wire the reconnect" }],
    together: [],
  };
  vi.mocked(readThread).mockImplementation(async () => ({ thread: state.threads[0], entries: structuredClone(entries) }));
  vi.mocked(readSnapshot).mockImplementation(async () => structuredClone(stored));
  vi.mocked(appendEntry).mockImplementation(async (_c, task, input) => {
    const created = entry({ hash: `h${entries.length + 1}`, seq: entries.length + 1, task, author: "me", lamport: input.lamport + 1, kind: input.kind, text: input.text ?? "", place: input.place ?? null, snapshot: input.snapshot ?? null, target: input.target ?? null, to: input.to ?? null });
    entries.push(created);
    return { entry: created, thread: state.threads[0] };
  });
  vi.mocked(storeSnapshot).mockImplementation(async (_c, snapshot) => ({ hash: "b".repeat(64), author: "me", createdAt: "", snapshot }));
  useStore.setState({ projects: [{ id: "p1", name: "Rabta", repoPath: "/Users/sam/code/rabta" } as never], connectors: [], activeTaskId: null });
  mockInvoke.mockImplementation(async (command: string) => {
    if (command === "import_task_snapshot") return { task: { id: "local-task", projectId: "p1", title: "Wire the reconnect" }, plan: {} };
    if (command === "activate_task") return { applied: ["vscode"], pending: [], skipped: [], savedPrevious: null, errors: [], closed: [], kept: [] };
    if (command === "active_task") return "mine";
    if (command === "list_tasks") return [{ id: "mine", projectId: "p1", title: "Fix the banner" }];
    if (command === "task_resources") return [{ id: "r", taskId: "mine", connectorKind: "vscode", resourceType: "workspace", payload: { openFiles: ["/Users/sam/code/rabta/src/banner.tsx"] }, createdAt: "" }];
    return [];
  });
});
afterEach(() => cleanup());
const render = (cursors: Record<string, TeamCursor> = {}) => renderWithProviders(<Room connection={connection} state={state} live cursors={cursors} threadVersion={0} refresh={refresh} />);

describe("The Room", () => {
  it("shows the thread, the inbox and the capsule, and steps in through a local import and the normal restore", async () => {
    render();
    await screen.findByText("Ship without the banner.");
    expect(screen.getByText("Alina handed you Wire the reconnect")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Wire the reconnect" })).toHaveLength(2);
    expect(screen.getByText("Alina · Rabta · 2 files · 1 link · 1 folder · branch feat/reconnect")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "packages/sdk/index.ts:40" })).toBeInTheDocument();
    const capsule = screen.getByLabelText("Your copy of this project") as HTMLSelectElement;
    expect(capsule.value).toBe("p1");
    fireEvent.click(within(screen.getByLabelText("Waiting for you")).getByRole("button", { name: "Step in" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("import_task_snapshot", { projectId: "p1", snapshot: stored.snapshot }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: "local-task", focusMode: false }));
    await waitFor(() => expect(appendEntry).toHaveBeenCalledWith(connection, "reconnect", expect.objectContaining({ kind: "accept", target: "h2", lamport: 2, prev: "h2" })));
    expect(useStore.getState().activeTaskId).toBe("local-task");
    expect(JSON.parse(localStorage.getItem("rabta.teams.threadTasks") ?? "{}")["room-1"].reconnect).toEqual({ projectId: "p1", taskId: "local-task" });
  });
  it("acknowledges a decision and ties a knot with the active capsule attached as references", async () => {
    render();
    await screen.findByText("Ship without the banner.");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(appendEntry).toHaveBeenCalledWith(connection, "reconnect", expect.objectContaining({ kind: "acknowledge", target: "h1", lamport: 2, prev: "h2" })));
    await screen.findByText("Acknowledged by Sam");
    fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "The retry lives here." } });
    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Attach my current capsule"));
    fireEvent.click(screen.getByRole("button", { name: "Tie the knot" }));
    await waitFor(() => expect(storeSnapshot).toHaveBeenCalled());
    const snapshot = vi.mocked(storeSnapshot).mock.calls[0][1];
    expect(snapshot.files).toEqual(["src/banner.tsx"]);
    expect(JSON.stringify(snapshot)).not.toContain("/Users/sam");
    await waitFor(() => expect(appendEntry).toHaveBeenCalledWith(connection, "reconnect", expect.objectContaining({ kind: "knot", text: "The retry lives here.", place: { type: "file", path: "apps/App.tsx" }, snapshot: "b".repeat(64), lamport: 3, prev: "h3" })));
    await screen.findByText("Added to the thread.");
    expect(screen.getByText("The retry lives here.")).toBeInTheDocument();
  });
  it("hands off to a teammate with the capsule, and starts a new thread with a service-safe id", async () => {
    render();
    await screen.findByText("Ship without the banner.");
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByLabelText("Thread"), { target: { value: "Fix the banner: v2!" } });
    fireEvent.click(screen.getByRole("radio", { name: "Hand off" }));
    fireEvent.change(screen.getByLabelText("Next step"), { target: { value: "Check the copy." } });
    fireEvent.click(screen.getByRole("button", { name: "Hand off" }));
    await screen.findByText("Choose who this goes to.");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "alina" } });
    fireEvent.click(screen.getByRole("button", { name: "Hand off" }));
    await waitFor(() => expect(appendEntry).toHaveBeenCalledWith(connection, "Fix-the-banner-v2", expect.objectContaining({ kind: "handoff", to: "alina", text: "Check the copy.", snapshot: "b".repeat(64), title: "Fix the banner: v2!", lamport: 0, prev: null })));
    await screen.findByText("Handed off to Alina. They see it the moment they look.");
    expect(refresh).toHaveBeenCalled();
  });
  it("shows teammates' cursors with their names only while they are here, and keeps Together off by default", async () => {
    const { rerender } = render({ alina: { memberId: "alina", task: "reconnect", pointer: { x: 0.25, y: 0.5 }, editor: null, leading: true, following: null, at: new Date().toISOString() } });
    await screen.findByText("Ship without the banner.");
    expect(screen.getByText("Leading")).toBeInTheDocument();
    expect(screen.getByText("in Wire the reconnect")).toBeInTheDocument();
    expect(document.querySelector(".teams-cursor-name")?.textContent).toBe("Alina");
    expect(screen.getByLabelText("Together: share my cursor")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Together: share my cursor"));
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    rerender(<Room connection={connection} state={state} live cursors={{}} threadVersion={0} refresh={refresh} />);
    await waitFor(() => expect(document.querySelector(".teams-cursor-name")).toBeNull());
    expect(screen.queryByText("in Wire the reconnect")).toBeNull();
  });
});
