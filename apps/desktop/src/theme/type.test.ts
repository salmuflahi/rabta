import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const sizes = config.theme.extend.fontSize;
const weights = config.theme.extend.fontWeight;

/** rem string -> px number, at the 16px root the app never overrides. */
const px = (rem: string) => Number(rem.replace("rem", "")) * 16;

describe("Mac type scale", () => {
  it("puts body at 13px", () => {
    expect(px(sizes.body[0])).toBe(13);
  });

  it("tracks body at -0.003em, per the handoff's body/list-row/nav row", () => {
    expect(sizes.body[1].letterSpacing).toBe("-0.003em");
  });

  it("retones meta to 11.5px for timestamps and inline mono text", () => {
    expect(px(sizes.meta[0])).toBe(11.5);
  });

  it("keeps label at 11px for group headers", () => {
    expect(px(sizes.label[0])).toBe(11);
  });

  it("retones title to the 22px screen title, tracked -0.02em", () => {
    expect(px(sizes.title[0])).toBe(22);
    expect(sizes.title[1].letterSpacing).toBe("-0.02em");
  });

  it("keeps card title within the handoff's 14-15px range", () => {
    const size = px(sizes.card[0]);
    expect(size).toBeGreaterThanOrEqual(14);
    expect(size).toBeLessThanOrEqual(15);
  });

  it("adds a display step for the 24px Overview date, tracked -0.02em", () => {
    expect(sizes.display).toBeDefined();
    expect(px(sizes.display[0])).toBe(24);
    expect(sizes.display[1].letterSpacing).toBe("-0.02em");
  });

  it("adds a sheet step for the 16px Migrate sheet title, tracked -0.015em", () => {
    expect(sizes.sheet).toBeDefined();
    expect(px(sizes.sheet[0])).toBe(16);
    expect(sizes.sheet[1].letterSpacing).toBe("-0.015em");
  });

  it("adds a secondary step for the 12px section label / secondary text", () => {
    expect(sizes.secondary).toBeDefined();
    expect(px(sizes.secondary[0])).toBe(12);
  });

  it("adds a payload step for the 10.5px <pre> block, at line-height 1.6", () => {
    expect(sizes.payload).toBeDefined();
    expect(px(sizes.payload[0])).toBe(10.5);
    expect(sizes.payload[1].lineHeight).toBe("1.6");
  });

  it("keeps every step at or below the 24px display step", () => {
    for (const [name, [size]] of Object.entries(sizes)) {
      expect(px(size), `${name} exceeds the Mac scale`).toBeLessThanOrEqual(24);
    }
  });

  it("raises the fontWeight ceiling to 640, including the macOS 510 and 590 steps", () => {
    expect(weights).toBeDefined();
    expect(String(weights[510])).toBe("510");
    expect(String(weights[590])).toBe("590");
    expect(String(weights[640])).toBe("640");
  });

  it("uses the system face first, with no bundled webfont", () => {
    const sans = config.theme.extend.fontFamily.sans;
    expect(sans[0]).toBe("-apple-system");
    expect(sans.join(" ")).not.toMatch(/Inter/i);
  });

  it("does not import the Inter webfont", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).not.toMatch(/fontsource/i);
  });

  it("does not depend on the Inter package", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(pkg.dependencies).not.toHaveProperty("@fontsource-variable/inter");
  });
});
