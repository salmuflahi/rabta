import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Envelope } from "../src/index";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("protocol fixtures", () => {
  for (const file of readdirSync(dir)) {
    it(`round-trips ${file}`, () => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(Envelope.parse(raw)).toEqual(raw);
    });
  }

  it("rejects an unknown kind", () => {
    expect(() => Envelope.parse({ v: 1, id: "x", kind: "nope", payload: {} })).toThrow();
  });

  it("rejects a hello with a wrong-typed capability list", () => {
    const raw = JSON.parse(readFileSync(join(dir, "hello.json"), "utf8"));
    raw.payload.capabilities = "workspace";
    expect(() => Envelope.parse(raw)).toThrow();
  });
});
