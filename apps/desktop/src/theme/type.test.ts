import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const sizes = (config as any).theme.extend.fontSize as Record<
  string,
  [string, { lineHeight: string; letterSpacing?: string }]
>;

/** rem string -> px number, at the 16px root the app never overrides. */
const px = (rem: string) => Number(rem.replace("rem", "")) * 16;

describe("Mac type scale", () => {
  it("puts body at 13px", () => {
    expect(px(sizes.body[0])).toBe(13);
  });

  it("puts secondary metadata at 11px", () => {
    expect(px(sizes.meta[0])).toBe(11);
  });

  it("keeps every step at or below the 22px large title", () => {
    for (const [name, [size]] of Object.entries(sizes)) {
      expect(px(size), `${name} exceeds the Mac scale`).toBeLessThanOrEqual(22);
    }
  });

  it("uses the system face first, with no bundled webfont", () => {
    const sans = (config as any).theme.extend.fontFamily.sans as string[];
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
