import { describe, expect, it } from "vitest";
import { imageHeader, outputSize, cropRegion, removeEdgeBackground, extractPalette, encodeBmp, exportName } from "./image-core.js";
import { brushStamp, readAlpha, writeAlpha, removeColorInRegion } from "./mask-core";
import { svgToCode } from "./svg-code";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("local image processing", () => {
  it("inspects dimensions before pixel allocation and rejects disguised or huge input", () => {
    expect(imageHeader(png(3840, 2160))).toEqual({ width: 3840, height: 2160, type: "png" });
    for (const input of [png(10_000, 10_000), png(0, 20), new Uint8Array(), new TextEncoder().encode("<svg><script>bad()</script></svg>")]) {
      expect(() => imageHeader(input)).toThrow();
    }
    expect(imageHeader(Uint8Array.from([255, 216, 255, 192, 0, 11, 8, 0, 20, 0, 30, 1, 1, 17, 0]))).toEqual({ width: 30, height: 20, type: "jpeg" });
  });

  it("allows 4096px output and rejects fractional or overflowing crops", () => {
    expect(outputSize(4096, 2000)).toEqual({ width: 4096, height: 2000 });
    for (const n of [0, -1, 4097, 1.5, Infinity, NaN]) expect(() => outputSize(n, 10)).toThrow();
    expect(cropRegion(1, 1, 2, 2, 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(() => cropRegion(3, 1, 2, 2, 4, 4)).toThrow();
    expect(() => cropRegion(.5, 1, 2, 2, 4, 4)).toThrow();
  });

  it("preserves enclosed white subject detail while removing the connected background", () => {
    const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) {
      const p = (y * 5 + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = 0;
    }
    const center = (2 * 5 + 2) * 4;
    data[center] = data[center + 1] = data[center + 2] = 255;
    expect(removeEdgeBackground(data, 5, 5, "#ffffff", 0)).toBe(16);
    expect(data[3]).toBe(0);
    expect(data[center + 3]).toBe(255);
    expect(data[(1 * 5 + 1) * 4 + 3]).toBe(255);
  });

  it("erases and restores original alpha without mutating original pixels; undo is exact", () => {
    const original = Uint8ClampedArray.from([20, 70, 40, 128, 255, 255, 255, 255, 20, 70, 40, 255, 0, 0, 0, 0]);
    const copy = original.slice(), data = original.slice(), alpha = readAlpha(data);
    brushStamp(data, original, 2, 2, .5, .5, 1, 0, false);
    expect(data[3]).toBe(0);
    expect([...data.slice(0, 3)]).toEqual([20, 70, 40]);
    brushStamp(data, original, 2, 2, .5, .5, 1, 0, true);
    expect(data[3]).toBe(128);
    writeAlpha(data, alpha);
    expect(data).toEqual(copy);
    expect(original).toEqual(copy);
  });

  it("selected removal never changes matching colors outside the selected area", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    expect(removeColorInRegion(data, 4, 4, "#ffffff", 0, { x: 1, y: 1, width: 2, height: 2 })).toBe(4);
    expect(data[3]).toBe(255);
    expect(data[(1 * 4 + 1) * 4 + 3]).toBe(0);
    expect(() => removeColorInRegion(data, 4, 4, "red", 0, { x: 1, y: 1, width: 2, height: 2 })).toThrow();
  });

  it("exports padded bottom-up BMP rows and samples only opaque palette pixels", async () => {
    const blob = encodeBmp(Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]), 1, 2);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(imageHeader(bytes)).toEqual({ width: 1, height: 2, type: "bmp" });
    expect([...bytes.slice(54, 62)]).toEqual([0, 255, 0, 0, 0, 0, 255, 0]);
    expect(extractPalette(Uint8ClampedArray.from([255, 0, 0, 0, 12, 34, 56, 255, 12, 34, 56, 255]))).toEqual([{ hex: "#0c2238", pixels: 2 }]);
    expect(exportName("my:photo.png", "convert", "jpeg")).toBe("my-photo-convert.jpg");
  });
});

describe("SVG to React conversion", () => {
  it("removes executable and external content while retaining safe geometry", () => {
    const result = svgToCode('<svg viewBox="0 0 24 24" onload="bad()"><script>bad()</script><foreignObject><div>unsafe</div></foreignObject><image href="https://example.com/track"/><path d="M0 0L2 2" fill="url(https://example.com/a)" style="fill:red"/><use href="#shape"/></svg>', "SafeIcon", false);
    expect(result.xml).not.toMatch(/onload|script|foreignObject|https:|style=/);
    expect(result.xml).toContain('d="M0 0L2 2"');
    expect(result.xml).toContain('href="#shape"');
    expect(result.removed).toBeGreaterThanOrEqual(5);
  });

  it("escapes JSX values, translates SVG attributes and preserves intended transparent fills", () => {
    const result = svgToCode('<svg width="24" height="24" fill="none"><path stroke="#fff" stroke-width="2" d="M0 0L2 2"/><text>{danger}</text></svg>', "MyIcon", true);
    expect(result.xml).toContain('viewBox="0 0 24 24"');
    expect(result.xml).toContain('fill="none"');
    expect(result.code).toContain('strokeWidth={"2"}');
    expect(result.code).toContain('stroke={"currentColor"}');
    expect(result.code).toContain('{"{danger}"}');
    expect(result.code).toContain('export function MyIcon');
  });

  it("rejects document entities, missing scale, invalid component names and excessive nesting", () => {
    expect(() => svgToCode('<!DOCTYPE svg [<!ENTITY foo "bar">]><svg viewBox="0 0 1 1"/>', "Good", false)).toThrow(/document types/);
    expect(() => svgToCode('<svg/>', "Good", false)).toThrow(/viewBox/);
    expect(() => svgToCode('<svg viewBox="0 0 1 1"/>', "not-valid", false)).toThrow(/component name/);
    expect(() => svgToCode('<svg viewBox="0 0 1 1">' + '<g>'.repeat(52) + '</g>'.repeat(52) + '</svg>', "Good", false)).toThrow(/complex/);
  });
});
