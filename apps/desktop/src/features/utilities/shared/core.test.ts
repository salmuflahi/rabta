import { describe, expect, it } from "vitest";
import {
  calculate,
  cleanLinks,
  colorValues,
  contrast,
  convertUnit,
  csvToJson,
  encodeText,
  jsonToCsv,
  randomPassword,
  renamedFiles,
  sha256,
  zipFiles,
} from "./core";
describe("local utility correctness and input boundaries", () => {
  it("cleans tracking while preserving required parameters, duplicates and fragments", () => {
    const result = cleanLinks(
      "https://example.com/a?id=3&id=4&utm_source=x&fbclid=y#read",
    );
    expect(result.removed).toBe(2);
    expect(result.text).toBe("https://example.com/a?id=3&id=4#read");
    expect(() => cleanLinks("javascript:alert(1)")).toThrow();
    expect(() => cleanLinks("https://example.com\nnot a url")).toThrow(
      "Line 2",
    );
  });
  it("round-trips quoted multiline CSV without coercing IDs", () => {
    const result = JSON.parse(
      csvToJson('id,note\r\n001,"a,b\nsecond ""line"""'),
    );
    expect(result).toEqual([{ id: "001", note: 'a,b\nsecond "line"' }]);
    expect(csvToJson(jsonToCsv(JSON.stringify(result)))).toBe(
      JSON.stringify(result, null, 2),
    );
    expect(() => csvToJson("a,a\n1,2")).toThrow("unique");
    expect(() => csvToJson("a,b\n1")).toThrow("Row 2");
    expect(() => csvToJson('a\n"unclosed')).toThrow("Close");
  });
  it("neutralizes spreadsheet formulas and treats prototype keys as data", () => {
    expect(jsonToCsv('[{"name":"=HYPERLINK(1)"}]')).toContain("'=HYPERLINK(1)");
    expect(JSON.parse(csvToJson("__proto__,value\nx,y"))[0].__proto__).toBe(
      "x",
    );
    expect(() => jsonToCsv('[{"nested":{"a":1}}]')).toThrow("Nested");
  });
  it("uses an arithmetic parser with conventional precedence and rejects code", () => {
    expect(calculate("(125 + 75) × 0.8")).toBe(160);
    expect(calculate("2^3^2")).toBe(512);
    expect(calculate("-2^2")).toBe(-4);
    expect(calculate("200*10%")).toBe(20);
    expect(calculate("0.1+0.2")).toBe(0.3);
    for (const s of [
      "1/0",
      "alert(1)",
      "1;process.exit()",
      "2(3)",
      "(2+3",
      "1e999",
    ])
      expect(() => calculate(s)).toThrow();
  });
  it("handles temperature boundaries and decimal versus binary units", () => {
    expect(convertUnit(32, "Temperature", "Fahrenheit", "Celsius")).toBe(0);
    expect(convertUnit(1, "Length", "Inches", "Centimeters")).toBeCloseTo(2.54);
    expect(convertUnit(1, "Data", "MiB", "Bytes")).toBe(1048576);
    expect(() => convertUnit(-1, "Temperature", "Kelvin", "Celsius")).toThrow(
      "absolute zero",
    );
  });
  it("round-trips Unicode and decodes entities as text", () => {
    const original = "Rabta رابطہ 👋";
    expect(
      encodeText(encodeText(original, "Base64 encode"), "Base64 decode"),
    ).toBe(original);
    expect(encodeText("&lt;script&gt;", "HTML decode")).toBe("<script>");
    expect(encodeText("&#x110000;", "HTML decode")).toBe("&#x110000;");
    expect(() => encodeText("%xx", "URL decode")).toThrow();
  });
  it("matches known color and cryptographic vectors", async () => {
    expect(contrast("#fff", "#000")).toBe(21);
    expect(colorValues("#fff").rgb).toBe("rgb(255, 255, 255)");
    expect(await sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(randomPassword(32, true)).toHaveLength(32);
    expect(() => randomPassword(3, true)).toThrow();
  });
  it("prevents filename collisions and preserves original bytes in a ZIP", () => {
    expect(renamedFiles(["one.png", "two.JPG"], "capture", 1, "", "")).toEqual([
      "capture-001.png",
      "capture-002.JPG",
    ]);
    expect(() => renamedFiles(["same.txt", "SAME.txt"], "", 1, "", "")).toThrow(
      "Two files",
    );
    expect(() => renamedFiles(["a.png"], "../out", 1, "", "")).toThrow();
    const bytes = new TextEncoder().encode("hello"),
      zip = zipFiles([{ name: "note.txt", bytes }]),
      view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0x3610a686);
    expect(zip.slice(38, 43)).toEqual(bytes);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });
});
