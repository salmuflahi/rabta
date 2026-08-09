import { beforeEach, describe, expect, it } from "vitest";
import { applyAccent, ACCENTS } from "@/theme/accent";
import { readPrefs, writePrefs, DEFAULT_PREFS } from "@/store";
import type { AccentId } from "@/theme/accent";

describe("applyAccent with invalid id", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
  });

  it("does not throw when given an invalid accent id", () => {
    expect(() => {
      applyAccent("not-a-real-accent" as any, "light", root);
    }).not.toThrow();
  });

  it("applies the default accent (tangerine) when given an invalid id in light mode", () => {
    applyAccent("not-a-real-accent" as any, "light", root);
    const expected = ACCENTS.tangerine.light;
    // Check that the CSS properties were set to the default accent
    expect(root.style.getPropertyValue("--primary")).toBeTruthy();
    // Verify it matches the default by checking against what a valid call would set
    const defaultRoot = document.createElement("div");
    applyAccent("tangerine", "light", defaultRoot);
    expect(root.style.getPropertyValue("--primary")).toBe(
      defaultRoot.style.getPropertyValue("--primary")
    );
  });

  it("applies the default accent (tangerine) when given an invalid id in dark mode", () => {
    applyAccent("not-a-real-accent" as any, "dark", root);
    const defaultRoot = document.createElement("div");
    applyAccent("tangerine", "dark", defaultRoot);
    expect(root.style.getPropertyValue("--primary")).toBe(
      defaultRoot.style.getPropertyValue("--primary")
    );
  });

  it("still correctly applies a valid accent id", () => {
    applyAccent("petrol", "light", root);
    const expected = ACCENTS.petrol.light;
    expect(root.style.getPropertyValue("--primary")).toBeTruthy();
    // Verify it's not the default by checking it differs from tangerine
    const tangerineRoot = document.createElement("div");
    applyAccent("tangerine", "light", tangerineRoot);
    expect(root.style.getPropertyValue("--primary")).not.toBe(
      tangerineRoot.style.getPropertyValue("--primary")
    );
  });
});

describe("readPrefs with corrupt persisted accent", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("returns default accent when persisted value is not a valid AccentId", () => {
    // Simulate a corrupt persisted value
    const corruptPrefs = { accent: "not-a-real-accent" };
    localStorage.setItem("rabta.prefs", JSON.stringify(corruptPrefs));

    const prefs = readPrefs();
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
  });

  it("returns default accent when persisted value is completely invalid JSON", () => {
    localStorage.setItem("rabta.prefs", "{ corrupt json");
    const prefs = readPrefs();
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
  });

  it("preserves other valid preferences when accent is corrupt", () => {
    const corruptPrefs = {
      accent: "invalid-accent",
      theme: "dark" as const,
      motion: "reduced" as const,
      developerMode: true,
    };
    localStorage.setItem("rabta.prefs", JSON.stringify(corruptPrefs));

    const prefs = readPrefs();
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
    expect(prefs.theme).toBe("dark");
    expect(prefs.motion).toBe("reduced");
    expect(prefs.developerMode).toBe(true);
  });

  it("still round-trips a valid accent correctly", () => {
    const validPrefs = { ...DEFAULT_PREFS, accent: "sky" as AccentId };
    writePrefs(validPrefs);

    const readBack = readPrefs();
    expect(readBack.accent).toBe("sky");
  });

  it("preserves all other preferences when roundtripping with valid accent", () => {
    const validPrefs = {
      ...DEFAULT_PREFS,
      accent: "petrol" as AccentId,
      theme: "light" as const,
      motion: "reduced" as const,
      developerMode: true,
      resumeOnLaunch: true,
    };
    writePrefs(validPrefs);

    const readBack = readPrefs();
    expect(readBack.accent).toBe("petrol");
    expect(readBack.theme).toBe("light");
    expect(readBack.motion).toBe("reduced");
    expect(readBack.developerMode).toBe(true);
    expect(readBack.resumeOnLaunch).toBe(true);
  });

  it("returns DEFAULT_PREFS when localStorage has no prefs key", () => {
    const prefs = readPrefs();
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
    expect(prefs).toEqual(DEFAULT_PREFS);
  });
});
