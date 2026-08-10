import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { MigrateSheet } from "./MigrateSheet";

const SURVEY = { capsules: 6, projects: 3, pairings: 2, history: 412 };

const INSPECT = {
  capsules: 6,
  projects: 3,
  pairings: 2,
  history: 412,
  hasPreferences: true,
  sourceHome: "/Users/sender",
  remapProjects: 3,
  remapPaths: 14,
  collisions: [{ kind: "project", name: "atlas-api" }],
  appsInstalled: [
    { kind: "chrome", capsules: 4, label: "Chrome", installed: true },
    { kind: "cursor", capsules: 2, label: "Cursor", installed: false },
    { kind: "terminal", capsules: 1, label: "Terminal", installed: null },
  ],
  reposPresent: [
    { name: "atlas-api", path: "/Users/receiver/code/atlas-api", branch: "main", present: true },
    { name: "mercury-web", path: "/Users/receiver/code/mercury-web", branch: "main", present: false },
  ],
  thisHome: "/Users/receiver",
};

function mockMigrate(overrides: Record<string, unknown> = {}) {
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    if (cmd in overrides) {
      const handler = overrides[cmd];
      return typeof handler === "function" ? handler(args) : handler;
    }
    switch (cmd) {
      case "migrate_survey":
        return SURVEY;
      case "migrate_home":
        return "/Users/receiver";
      case "migrate_inspect":
        return INSPECT;
      case "migrate_export":
        return { path: "/Users/receiver/Desktop/rabta-2026-08-10.rabta", bytes: 1_258_291 };
      case "migrate_apply":
        return {
          projectsAdded: 3,
          projectsReplaced: 0,
          projectsSkipped: 0,
          capsulesAdded: 6,
          pairingsAdded: 2,
          eventsAdded: 412,
          pathsRemapped: 14,
        };
      case "migrate_preferences":
        return null;
      default:
        return [];
    }
  });
}

/** Waits for the open effect's `migrate_home` to land, which pre-fills the
 * path — otherwise a test types into a field that is about to be
 * overwritten. */
async function openedAt(role: "send" | "receive") {
  useStore.getState().openMigrate(role);
  renderWithProviders(<MigrateSheet />);
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("migrate_home"));
}

function primary() {
  return screen
    .getAllByRole("button")
    .find((b) => b.className.includes("bg-primary")) as HTMLButtonElement;
}

describe("MigrateSheet", () => {
  beforeEach(() => {
    useStore.getState().closeMigrate();
    mockMigrate();
  });

  it("renders nothing until a migration is started", () => {
    renderWithProviders(<MigrateSheet />);
    expect(screen.queryByText("Send to another Mac")).toBeNull();
  });

  it("opens at the role it was asked for", async () => {
    await openedAt("receive");
    expect(screen.getByText("Receive from another Mac")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });

  // Sending copies. Saying so on the sheet's own subtitle is the difference
  // between a user trying it and a user not daring to.
  it("says up front that sending removes nothing", async () => {
    await openedAt("send");
    expect(screen.getByText("Nothing is removed from this Mac.")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  // Nearby Mac is drawn because it was designed, and disabled because
  // building it would put this app's data on a network for the first time.
  it("offers Nearby Mac as disabled, with the reason", async () => {
    await openedAt("send");
    const nearby = screen.getByRole("radio", { name: /Nearby Mac/ });
    expect(nearby).toBeDisabled();
    expect(screen.getByText(/first thing Rabta sends over a network/)).toBeInTheDocument();
    // And it cannot be selected by clicking it anyway.
    fireEvent.click(nearby);
    expect(useStore.getState().mig?.transport).toBe("file");
  });
});

describe("MigrateSheet — what comes across", () => {
  beforeEach(() => {
    useStore.getState().closeMigrate();
    mockMigrate();
  });

  async function toIncludeStep() {
    await openedAt("send");
    fireEvent.click(primary());
    await screen.findByText("Capsules");
  }

  // Every count is the real one from the database. The handoff's own
  // figures are examples, and printing them would be a lie the user only
  // discovers on the other Mac.
  it("counts what is actually on this Mac", async () => {
    await toIncludeStep();
    expect(mockInvoke).toHaveBeenCalledWith("migrate_survey");
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("412 events")).toBeInTheDocument();
  });

  it("carries the privacy line verbatim", async () => {
    await toIncludeStep();
    expect(
      screen.getByText("Saves paths, URLs and branch names — never your files, pages or passwords."),
    ).toBeInTheDocument();
  });

  // The handoff's note on this row, and the actual behaviour of the bundle.
  it("says pairings are re-approved rather than carried", async () => {
    await toIncludeStep();
    expect(screen.getByText(/You re-approve them on the new Mac/)).toBeInTheDocument();
  });

  // A capsule whose project didn't cross is a row with no name to show, so
  // the bundle brings it regardless — the UI shouldn't pretend otherwise.
  it("locks Projects on while Capsules is on, and explains why", async () => {
    await toIncludeStep();
    const projects = screen.getByLabelText(/^Projects/);
    expect(projects).toBeChecked();
    expect(projects).toBeDisabled();
    expect(screen.getByText(/a capsule needs its project to have a name/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^Capsules/));
    await waitFor(() => expect(screen.getByLabelText(/^Projects/)).toBeEnabled());
  });
});

describe("MigrateSheet — writing the bundle", () => {
  beforeEach(() => {
    useStore.getState().closeMigrate();
    mockMigrate();
  });

  async function toFileStep() {
    await openedAt("send");
    fireEvent.click(primary());
    await screen.findByText("Capsules");
    fireEvent.click(primary());
    await screen.findByLabelText("Passphrase");
  }

  it("states the passphrase warning in the handoff's words", async () => {
    await toFileStep();
    expect(
      screen.getByText("Without it the bundle is unreadable — Rabta cannot recover it for you."),
    ).toBeInTheDocument();
  });

  it("will not write without a passphrase", async () => {
    await toFileStep();
    expect(primary()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "hunter2" } });
    await waitFor(() => expect(primary()).toBeEnabled());
  });

  it("writes the bundle and reports its real size and location", async () => {
    await toFileStep();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "hunter2" } });
    fireEvent.click(primary());

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "migrate_export",
        expect.objectContaining({ passphrase: "hunter2" }),
      ),
    );
    // The filename appears twice — as the headline and inside the full path.
    expect((await screen.findAllByText(/rabta-2026-08-10\.rabta/)).length).toBeGreaterThan(0);
    // 1,258,291 bytes, shown the way a person reads it.
    expect(screen.getByText(/1\.2 MB/)).toBeInTheDocument();
    expect(screen.getByText("Nothing was removed from this Mac.")).toBeInTheDocument();
  });

  it("stays on the File step and says why when writing fails", async () => {
    mockMigrate({
      migrate_export: () => {
        throw new Error("disk full");
      },
    });
    await toFileStep();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "hunter2" } });
    fireEvent.click(primary());

    await waitFor(() => expect(useStore.getState().mig?.step).toBe(2));
    expect(screen.getByLabelText("Passphrase")).toBeInTheDocument();
  });
});

describe("MigrateSheet — the review step", () => {
  beforeEach(() => {
    useStore.getState().closeMigrate();
    mockMigrate();
  });

  async function toReview() {
    await openedAt("receive");
    fireEvent.click(primary());
    await screen.findByLabelText("Bundle");
    fireEvent.change(screen.getByLabelText("Bundle"), {
      target: { value: "/Users/receiver/Downloads/in.rabta" },
    });
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "hunter2" } });
    fireEvent.click(primary());
    await screen.findByText("Folders");
  }

  it("opens the bundle without writing anything", async () => {
    await openedAt("receive");
    // Said on the sheet's subtitle before anything is chosen...
    expect(screen.getByText("Nothing is written until you have reviewed it.")).toBeInTheDocument();
    fireEvent.click(primary());
    await screen.findByLabelText("Bundle");
    // ...and again on the step that asks for the file.
    expect(screen.getByText(/Nothing is written until you have seen what's in it/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bundle"), { target: { value: "/tmp/in.rabta" } });
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pw" } });
    fireEvent.click(primary());

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("migrate_inspect", expect.anything()));
    expect(mockInvoke).not.toHaveBeenCalledWith("migrate_apply", expect.anything());
  });

  it("reports exactly how much the folder remap touches", async () => {
    await toReview();
    expect(screen.getByText("Applies to 3 projects and 14 saved file paths.")).toBeInTheDocument();
    expect(screen.getByLabelText("New home folder")).toHaveValue("/Users/receiver");
  });

  // The handoff's amber case, and the honest one: a capsule that used an app
  // this Mac doesn't have still restores everything else.
  it("names the apps that aren't here and what that costs", async () => {
    await toReview();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("not installed")).toBeInTheDocument();
    expect(
      screen.getByText(/Capsules that used Cursor will restore everything else/),
    ).toBeInTheDocument();
  });

  // "can't tell" and "not installed" send the user to different places.
  it("does not claim a built-in tool is missing", async () => {
    await toReview();
    expect(screen.getByText("built in")).toBeInTheDocument();
  });

  it("says which repository folders aren't here, and promises not to touch git", async () => {
    await toReview();
    expect(screen.getByText("/Users/receiver/code/mercury-web")).toBeInTheDocument();
    expect(screen.getByText(/never clones, pushes, resets or discards/)).toBeInTheDocument();
  });

  // Replace is the only destructive choice, and the note has to change with
  // the choice — that sentence is the whole safety net.
  it("changes its warning with the merge choice", async () => {
    await toReview();
    expect(screen.getByText(/Nothing here is touched/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Replace" }));
    expect(await screen.findByText(/That cannot be undone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Skip" }));
    expect(await screen.findByText(/This Mac's versions are kept/)).toBeInTheDocument();
  });

  it("applies with the reviewed plan and reports what happened", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("radio", { name: "Replace" }));
    fireEvent.click(primary());

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "migrate_apply",
        expect.objectContaining({
          plan: { newHome: "/Users/receiver", merge: "replace" },
        }),
      ),
    );
    expect(
      await screen.findByText("6 capsules are on this Mac — nothing is open yet."),
    ).toBeInTheDocument();
    expect(screen.getByText(/14 paths remapped/)).toBeInTheDocument();
  });

  it("returns to the review rather than claiming success when applying fails", async () => {
    mockMigrate({
      migrate_apply: () => {
        throw new Error("locked");
      },
    });
    await toReview();
    fireEvent.click(primary());
    await waitFor(() => expect(useStore.getState().mig?.step).toBe(2));
    expect(screen.getByText("Folders")).toBeInTheDocument();
  });

  it("lands on Capsules when it's done", async () => {
    await toReview();
    fireEvent.click(primary());
    await screen.findByText("6 capsules are on this Mac — nothing is open yet.");
    fireEvent.click(screen.getByRole("button", { name: "Go to Capsules" }));

    expect(useStore.getState().mig).toBeNull();
    expect(useStore.getState().view).toBe("capsules");
  });
});
