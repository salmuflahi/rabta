import { describe, expect, it } from "vitest";
import { activateSummaryToResult, type ActivateSummary } from "./normalize";
import type { RestoreTool } from "./types";

const TOOLS: RestoreTool[] = [
  { id: "vscode-1", name: "VS Code", kind: "vscode" },
  { id: "chrome-1", name: "Chrome", kind: "chrome" },
  { id: "terminal-1", name: "Terminal", kind: "terminal" },
];

function summary(overrides: Partial<ActivateSummary>): ActivateSummary {
  return {
    applied: [],
    pending: [],
    skipped: [],
    savedPrevious: null,
    errors: [],
    ...overrides,
  };
}

describe("activateSummaryToResult", () => {
  it("all applied -> success, every tool row is applied", () => {
    const result = activateSummaryToResult(
      summary({ applied: ["vscode", "chrome", "terminal"] }),
      TOOLS
    );
    expect(result.overall).toBe("success");
    expect(result.tools).toEqual([
      { id: "vscode-1", status: "applied" },
      { id: "chrome-1", status: "applied" },
      { id: "terminal-1", status: "applied" },
    ]);
    expect(result.error).toBeUndefined();
  });

  it("empty summary + no tools -> success, nothing to restore is not a partial failure", () => {
    const result = activateSummaryToResult(summary({}), []);
    expect(result.overall).toBe("success");
    expect(result.tools).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("some skipped -> partial, skipped tool carries no failure semantics", () => {
    const result = activateSummaryToResult(
      summary({ applied: ["vscode"], skipped: ["chrome"] }),
      TOOLS
    );
    expect(result.overall).toBe("partial");
    expect(result.tools.find((t) => t.id === "vscode-1")).toEqual({ id: "vscode-1", status: "applied" });
    expect(result.tools.find((t) => t.id === "chrome-1")).toEqual({ id: "chrome-1", status: "skipped" });
  });

  it("some pending -> partial, pending tool is skipped with 'On next reload'", () => {
    const result = activateSummaryToResult(
      summary({ applied: ["vscode"], pending: ["terminal"] }),
      TOOLS
    );
    expect(result.overall).toBe("partial");
    expect(result.tools.find((t) => t.id === "terminal-1")).toEqual({
      id: "terminal-1",
      status: "skipped",
      message: "On next reload",
    });
  });

  it("empty applied + errors present -> failure", () => {
    const result = activateSummaryToResult(
      summary({ errors: ["something went wrong before anything applied"] }),
      TOOLS
    );
    expect(result.overall).toBe("failure");
    expect(result.error).toBe("something went wrong before anything applied");
  });

  it("error clearly attributable to a kind -> that tool is failed, others unaffected", () => {
    const result = activateSummaryToResult(
      summary({
        applied: ["vscode", "terminal"],
        errors: ["chrome: connector timed out"],
      }),
      TOOLS
    );
    expect(result.tools.find((t) => t.id === "chrome-1")).toEqual({
      id: "chrome-1",
      status: "failed",
      message: "Couldn't restore",
    });
    expect(result.tools.find((t) => t.id === "vscode-1")).toEqual({ id: "vscode-1", status: "applied" });
    // Attributed errors don't leak into the general/technical-details error.
    expect(result.error).toBeUndefined();
    // Something applied + one attributed failure -> partial, not failure.
    expect(result.overall).toBe("partial");
  });

  it("unattributable error alongside applied tools -> partial with a general error surfaced", () => {
    const result = activateSummaryToResult(
      summary({ applied: ["vscode"], errors: ["a mysterious problem occurred"] }),
      TOOLS
    );
    expect(result.overall).toBe("partial");
    expect(result.error).toBe("a mysterious problem occurred");
  });

  it("a tool whose kind isn't mentioned anywhere is treated as skipped, never fabricated as applied", () => {
    const result = activateSummaryToResult(summary({ applied: ["vscode"] }), TOOLS);
    expect(result.tools.find((t) => t.id === "chrome-1")).toEqual({ id: "chrome-1", status: "skipped" });
  });
});
