// Original Rabta implementations. No Vorssaint source is incorporated.
export const TEXT_LIMIT = 200_000;
export function boundedText(text: string) {
  if (text.length > TEXT_LIMIT)
    throw new Error("Keep text under 200,000 characters.");
  return text;
}
const TRACKING =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|igsh|_ga|_gl|vero_id|oly_anon_id|oly_enc_id)$/i;
export function cleanLinks(
  text: string,
  custom = "",
): { text: string; removed: number } {
  boundedText(text);
  const extra = new Set(
    custom
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  let removed = 0;
  const output = text.split(/\r?\n/).map((line, i) => {
    if (!line.trim()) return "";
    let url: URL;
    try {
      url = new URL(line.trim());
    } catch {
      throw new Error(`Line ${i + 1}: enter a full https:// or http:// link.`);
    }
    if (!/^https?:$/.test(url.protocol))
      throw new Error(
        `Line ${i + 1}: only HTTP and HTTPS links are supported.`,
      );
    for (const key of [...new Set(url.searchParams.keys())]) {
      if (TRACKING.test(key) || extra.has(key.toLowerCase())) {
        removed += url.searchParams.getAll(key).length;
        url.searchParams.delete(key);
      }
    }
    return url.href;
  });
  return { text: output.join("\n"), removed };
}
export const TEXT_ACTIONS = [
  "Sentence case",
  "UPPERCASE",
  "lowercase",
  "Title Case",
  "Trim lines",
  "Remove empty lines",
  "Remove duplicate lines",
  "Sort lines",
  "Reverse lines",
] as const;
export function transformText(input: string, action: string): string {
  const s = boundedText(input),
    lines = s.split(/\r?\n/);
  switch (action) {
    case "UPPERCASE":
      return s.toLocaleUpperCase("en-US");
    case "lowercase":
      return s.toLocaleLowerCase("en-US");
    case "Title Case":
      return s
        .toLocaleLowerCase("en-US")
        .replace(
          /(^|\s)(\p{L})/gu,
          (_, a, b) => a + b.toLocaleUpperCase("en-US"),
        );
    case "Sentence case":
      return s
        .toLocaleLowerCase("en-US")
        .replace(
          /(^|[.!?]\s+)(\p{L})/gu,
          (_, a, b) => a + b.toLocaleUpperCase("en-US"),
        );
    case "Trim lines":
      return lines.map((s) => s.trim()).join("\n");
    case "Remove empty lines":
      return lines.filter((s) => s.trim()).join("\n");
    case "Remove duplicate lines":
      return [...new Set(lines)].join("\n");
    case "Sort lines":
      return lines
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .join("\n");
    case "Reverse lines":
      return lines.reverse().join("\n");
    default:
      throw new Error("Choose a text operation.");
  }
}
export function formatJson(input: string, compact: boolean) {
  boundedText(input);
  try {
    return JSON.stringify(JSON.parse(input), null, compact ? undefined : 2);
  } catch (e) {
    throw new Error(
      `Invalid JSON. ${e instanceof Error ? e.message : "Check commas, quotes and brackets."}`,
    );
  }
}
export function parseCsv(input: string): string[][] {
  boundedText(input);
  const s = input.replace(/^\uFEFF/, ""),
    rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    afterQuote = false;
  const endField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else field += c;
    } else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else if (c === '"' && field === "" && !afterQuote) quoted = true;
    else if (c === '"' || afterQuote)
      throw new Error("A quoted CSV field must end with a comma or newline.");
    else field += c;
  }
  if (quoted) throw new Error("Close the quoted CSV field before converting.");
  if (field !== "" || row.length || afterQuote) endRow();
  return rows;
}
export function csvToJson(input: string) {
  const [headers, ...rows] = parseCsv(input);
  if (!headers?.length || headers.some((h) => !h.trim()))
    throw new Error("Add a nonempty header for each column.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Column names must be unique.");
  return JSON.stringify(
    rows.map((r, i) => {
      if (r.length !== headers.length)
        throw new Error(
          `Row ${i + 2} has ${r.length} fields; expected ${headers.length}.`,
        );
      return Object.fromEntries(headers.map((h, i) => [h, r[i]]));
    }),
    null,
    2,
  );
}
export function jsonToCsv(input: string) {
  const rows: unknown = JSON.parse(boundedText(input));
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
  )
    throw new Error("Use a nonempty JSON array of flat objects.");
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown) => {
    if (v !== null && typeof v === "object")
      throw new Error(
        "Nested objects and arrays cannot become flat CSV cells.",
      );
    const s = String(v ?? "");
    // Protect spreadsheets from formula execution, including whitespace-prefixed formulas.
    const safe = /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return [
    keys.map(escape).join(","),
    ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
  ].join("\r\n");
}
export const ENCODINGS = [
  "Base64 encode",
  "Base64 decode",
  "URL encode",
  "URL decode",
  "HTML encode",
  "HTML decode",
] as const;
export function encodeText(input: string, action: string) {
  boundedText(input);
  switch (action) {
    case "Base64 encode": {
      const bytes = new TextEncoder().encode(input);
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    }
    case "Base64 decode": {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(atob(input.replace(/\s/g, "")), (c) =>
            c.charCodeAt(0),
          ),
        );
      } catch {
        throw new Error("Enter valid Base64 containing UTF-8 text.");
      }
    }
    case "URL encode":
      return encodeURIComponent(input);
    case "URL decode":
      try {
        return decodeURIComponent(input);
      } catch {
        throw new Error("Invalid URL encoding. Check incomplete % escapes.");
      }
    case "HTML encode":
      return input.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    case "HTML decode":
      return input.replace(
        /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
        (match, s: string) => {
          const entities: Record<string, string> = {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
          };
          if (s[0] !== "#") return entities[s.toLowerCase()] ?? match;
          const n =
            s[1].toLowerCase() === "x"
              ? parseInt(s.slice(2), 16)
              : parseInt(s.slice(1), 10);
          return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
            ? String.fromCodePoint(n)
            : match;
        },
      );
    default:
      throw new Error("Choose an encoding.");
  }
}
// Small recursive-descent arithmetic parser; user input is never evaluated as code.
export function calculate(input: string): number {
  if (input.length > 500)
    throw new Error("Keep expressions under 500 characters.");
  const raw = input.replace(/\s/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  const tokens =
    raw.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/^%]/gi) ?? [];
  if (!raw || tokens.join("") !== raw)
    throw new Error("Use numbers, parentheses, + − × ÷, ^ and %.");
  let i = 0,
    depth = 0;
  const atom = (): number => {
    if (++depth > 40) throw new Error("Too many nested parentheses.");
    let v: number;
    if (tokens[i] === "(") {
      i++;
      v = sum();
      if (tokens[i++] !== ")") throw new Error("Close the parenthesis.");
    } else {
      const t = tokens[i++];
      if (!t || !/^\d|^\./.test(t)) throw new Error("A number is missing.");
      v = Number(t);
    }
    while (tokens[i] === "%") {
      i++;
      v /= 100;
    }
    depth--;
    return v;
  };
  const power = (): number => {
    const v = atom();
    if (tokens[i] === "^") {
      i++;
      return v ** unary();
    }
    return v;
  };
  const unary = (): number => {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const sign = tokens[i++];
      return (sign === "-" ? -1 : 1) * unary();
    }
    return power();
  };
  const product = (): number => {
    let v = unary();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++],
        rhs = unary();
      if (op === "/" && rhs === 0)
        throw new Error("Division by zero has no finite result.");
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++],
        rhs = product();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  };
  const value = sum();
  if (i !== tokens.length) throw new Error("Add an operator between values.");
  if (!Number.isFinite(value))
    throw new Error("The result is outside the supported number range.");
  return Number(value.toPrecision(13));
}
export const UNITS: Record<string, Record<string, number>> = {
  Length: {
    Meters: 1,
    Centimeters: 0.01,
    Millimeters: 0.001,
    Kilometers: 1000,
    Inches: 0.0254,
    Feet: 0.3048,
    Yards: 0.9144,
    Miles: 1609.344,
  },
  Weight: {
    Kilograms: 1,
    Grams: 0.001,
    Pounds: 0.45359237,
    Ounces: 0.028349523125,
  },
  Temperature: { Celsius: 1, Fahrenheit: 1, Kelvin: 1 },
  Time: { Seconds: 1, Minutes: 60, Hours: 3600, Days: 86400, Weeks: 604800 },
  Data: {
    Bytes: 1,
    KB: 1000,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1048576,
    GiB: 1073741824,
    TiB: 1099511627776,
  },
};
export function convertUnit(
  value: number,
  category: string,
  from: string,
  to: string,
) {
  const units = UNITS[category];
  if (!Number.isFinite(value) || !units?.[from] || !units?.[to])
    throw new Error("Choose valid units and enter a finite number.");
  if (category === "Temperature") {
    const c =
      from === "Fahrenheit"
        ? ((value - 32) * 5) / 9
        : from === "Kelvin"
          ? value - 273.15
          : value;
    if (c < -273.150000001)
      throw new Error("Temperature cannot be below absolute zero.");
    return to === "Fahrenheit"
      ? (c * 9) / 5 + 32
      : to === "Kelvin"
        ? c + 273.15
        : c;
  }
  const result = (value * units[from]) / units[to];
  if (!Number.isFinite(result)) throw new Error("The result is too large.");
  return result;
}
export async function sha256(data: string | ArrayBuffer) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomPassword(length: number, symbols: boolean) {
  if (!Number.isInteger(length) || length < 12 || length > 128)
    throw new Error("Choose 12–128 characters.");
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" +
    (symbols ? "!@#$%^&*()-_=+[]{}:,.?" : "");
  let out = "";
  const cap = 256 - (256 % chars.length);
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < cap) out += chars[b % chars.length];
      if (out.length === length) break;
    }
  }
  return out;
}
export function colorValues(hex: string) {
  const match = hex.trim().match(/^#?([\da-f]{6}|[\da-f]{3})$/i);
  if (!match)
    throw new Error("Use a three- or six-digit hex color, such as #BAD0BD.");
  const h =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb.map((n) => n / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  let hue = 0;
  if (d)
    hue =
      (max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4) * 60;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const linear = rgb.map((n) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return {
    hex: "#" + h.toUpperCase(),
    rgb: `rgb(${rgb.join(", ")})`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
    luminance: linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722,
  };
}
export function contrast(a: string, b: string) {
  const x = colorValues(a).luminance,
    y = colorValues(b).luminance;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function renamedFiles(
  names: string[],
  prefix: string,
  start: number,
  find: string,
  replacement: string,
) {
  if (!Number.isInteger(start) || start < 0 || start > 999999)
    throw new Error("Start numbering between 0 and 999999.");
  if (/[\x00-\x1f/\\:*?"<>|]/.test(prefix + find + replacement))
    throw new Error(
      "Names cannot contain slashes or reserved filename characters.",
    );
  const used = new Set<string>();
  return names.map((name, i) => {
    const dot = name.lastIndexOf("."),
      ext = dot > 0 ? name.slice(dot) : "",
      stem = dot > 0 ? name.slice(0, dot) : name;
    let next = prefix
      ? `${prefix}-${String(start + i).padStart(3, "0")}${ext}`
      : `${find ? stem.split(find).join(replacement) : stem}${ext}`;
    next = next.trim();
    if (
      !next ||
      next === "." ||
      next === ".." ||
      new TextEncoder().encode(next).length > 240
    )
      throw new Error("Use nonempty filenames under 240 UTF-8 bytes.");
    if (/[\x00-\x1f/\\:*?"<>|]/.test(next))
      throw new Error("A filename contains unsupported characters.");
    if (used.has(next.toLocaleLowerCase("en-US")))
      throw new Error(
        `Two files would be named ${next}. Add a numbered prefix.`,
      );
    used.add(next.toLocaleLowerCase("en-US"));
    return next;
  });
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// ZIP STORE: no compression, UTF-8 names, original bytes retained.
export function zipFiles(
  files: { name: string; bytes: Uint8Array }[],
): Uint8Array {
  if (files.length > 100) throw new Error("Choose at most 100 files.");
  let offset = 0;
  const local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  const enc = new TextEncoder();
  for (const file of files) {
    const name = enc.encode(file.name),
      crc = crc32(file.bytes),
      header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, file.bytes.length, true);
    v.setUint32(22, file.bytes.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x800, true);
    e.setUint16(14, 0x21, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, file.bytes.length, true);
    e.setUint32(24, file.bytes.length, true);
    e.setUint16(28, name.length, true);
    e.setUint32(42, offset, true);
    entry.set(name, 46);
    local.push(header, file.bytes);
    central.push(entry);
    offset += header.length + file.bytes.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const p of [...local, ...central, end]) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
