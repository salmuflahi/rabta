import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Connector } from "../src/index";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const headlessBin = join(repoRoot, "target", "debug", "examples", "headless");

function startHub(dataDir: string) {
  const child = spawn(headlessBin, ["--probe"], {
    env: { ...process.env, OMNIBUS_DATA_DIR: dataDir },
  });
  const lines: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const l of chunk.split("\n")) if (l.trim()) lines.push(l.trim());
  });
  return { child, lines };
}

async function until(pred: () => boolean, ms = 15000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

// NOTE: deviation from the brief. `l.includes('"probe"')` also matches the
// hub's `ConnectorConnected` event line, since our test connector declares
// the capability `"probe"` (serialized as `"capabilities":["probe"]`), and
// that event is printed before the probe outcome line. Anchor on the
// outcome line's actual shape (`{"probe":...}` at the start of the line)
// so we don't pick up the capability line by accident.
const probeLines = (lines: string[]) => lines.filter((l) => l.startsWith('{"probe":'));

describe("connector-sdk against headless hub", () => {
  let dataDir: string;
  let hub: { child: ChildProcess; lines: string[] };
  let conn: Connector | undefined;

  beforeAll(() => {
    const build = spawnSync("cargo", ["build", "-p", "omnibus-hub", "--example", "headless"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    expect(build.status).toBe(0);
    dataDir = mkdtempSync(join(tmpdir(), "omnibus-sdk-test-"));
    hub = startHub(dataDir);
  });

  afterAll(() => {
    conn?.close();
    hub.child.kill();
  });

  it("discovers the hub, registers, and answers a command", async () => {
    await until(() => existsSync(join(dataDir, "hub.json")));
    // Handlers must be registered via `setup` (which runs before dialing):
    // the probing hub sends its command immediately on connect.
    conn = await connect(
      {
        name: "sdk-test",
        kind: "fake",
        capabilities: ["probe"],
        hubFile: join(dataDir, "hub.json"),
      },
      (c) => c.onCommand("probe.echo", (args) => ({ echoed: args }))
    );
    expect(conn.connectorId).toBeTruthy();

    await until(() => probeLines(hub.lines).length >= 1);
    const probe = JSON.parse(probeLines(hub.lines)[0]).probe;
    expect(probe.ok).toBe(true);
    expect(probe.result).toEqual({ echoed: { n: 1 } });
  }, 30000);

  it("reconnects with backoff after a hub restart", async () => {
    hub.child.kill();
    await new Promise((r) => setTimeout(r, 500));
    hub = startHub(dataDir); // new port, hub.json rewritten; SDK must re-read it
    await until(() => probeLines(hub.lines).length >= 1, 20000);
    const probe = JSON.parse(probeLines(hub.lines)[0]).probe;
    expect(probe.ok).toBe(true);
  }, 40000);
});
