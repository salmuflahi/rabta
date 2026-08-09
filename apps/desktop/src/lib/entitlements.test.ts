import { describe, expect, it } from "vitest";
import { hasCapability, type Capability } from "./entitlements";

const ALL: Capability[] = [
  "migrate",
  "unlimited-projects",
  "unlimited-capsules",
  "extended-history",
];

describe("entitlements", () => {
  // Rabta is free today, with no account and nothing uploaded — the README,
  // the sidebar and the website all say so. This test is the tripwire: the day
  // someone makes this return false, they have to come here and say so out
  // loud, which is exactly the conversation that should happen first.
  it.each(ALL)("grants %s — everything is free today", (capability) => {
    expect(hasCapability(capability)).toBe(true);
  });

  it("grants every named capability, so the list cannot drift out of the test", () => {
    expect(ALL.every(hasCapability)).toBe(true);
  });
});
