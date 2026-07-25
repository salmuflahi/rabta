import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/store";

describe("connector store carries reported version", () => {
  beforeEach(() => {
    useStore.setState({ connectors: [], log: [] });
  });

  it("setConnectors keeps the version a live connector reported", () => {
    useStore.getState().setConnectors([
      { id: "c1", name: "VS Code", kind: "vscode", capabilities: ["files"], version: "0.3.0" },
      { id: "c2", name: "Legacy", kind: "fake", capabilities: [] },
    ]);
    const rows = useStore.getState().connectors;
    expect(rows.find((r) => r.id === "c1")?.version).toBe("0.3.0");
    expect(rows.find((r) => r.id === "c2")?.version).toBeUndefined();
  });

  it("preload seeds a known connector's last-reported version onto its row", () => {
    useStore.getState().preload(
      [],
      [
        {
          name: "Chrome",
          kind: "chrome",
          capabilities: ["tabs"],
          version: "1.2.3",
          firstSeen: "2026-01-01T00:00:00.000Z",
          lastSeen: "2026-01-02T00:00:00.000Z",
        },
      ]
    );
    const row = useStore.getState().connectors.find((r) => r.name === "Chrome");
    expect(row?.version).toBe("1.2.3");
    expect(row?.connected).toBe(false);
  });
});
