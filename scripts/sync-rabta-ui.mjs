import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const studio = process.argv[2];
if (!studio)
  throw new Error(
    "Usage: node scripts/sync-rabta-ui.mjs /path/to/rabta-studio",
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = resolve(studio, "packages/rabta-ui");
const pkg = JSON.parse(
  await readFile(resolve(upstream, "package.json"), "utf8"),
);
if (pkg.name !== "@rabta/ui")
  throw new Error("The source must be Rabta Studio's @rabta/ui package.");
const names = [
  "brand.ts",
  "brand.css",
  "glyphs.tsx",
  "lens.tsx",
  "lens.css",
  "surface.tsx",
  "config.ts",
  "activity.ts",
  "icons.tsx",
];
// Read the complete subset before changing any destination file.
const files = await Promise.all(
  names.map(async (name) => [
    name,
    await readFile(resolve(upstream, "src", name)),
  ]),
);
files.push(["LICENSE", await readFile(resolve(upstream, "LICENSE"))]);
const destination = resolve(root, "apps/desktop/src/vendor/rabta-ui");
await mkdir(destination, { recursive: true });
for (const [name, contents] of files)
  await writeFile(resolve(destination, name), contents);
await writeFile(
  resolve(destination, "upstream.json"),
  JSON.stringify(
    {
      package: pkg.name,
      version: pkg.version,
      source: "Rabta Studio / packages/rabta-ui/src",
      files: Object.fromEntries(
        files.map(([name, contents]) => [
          name,
          createHash("sha256").update(contents).digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Synchronized ${files.length} files from ${pkg.name} ${pkg.version}.`,
);

// Build the legacy public icon API from the canonical 24px original glyphs.
const iconSource = await readFile(resolve(upstream, "src/icons.tsx"), "utf8");
const iconStart = iconSource.indexOf(
  "{",
  iconSource.indexOf("export const ICON_PATHS"),
);
const iconEnd = iconSource.indexOf("} as const", iconStart);
const paths = Function(
  `return (${iconSource.slice(iconStart, iconEnd + 1)})`,
)();
const iconMap = {
  overview: "workspace",
  capsule: "capsule",
  projects: "layers",
  connectors: "link",
  activity: "timeline",
  utilities: "wrench",
  settings: "sliders",
  shield: "shield",
  search: "search",
  plus: "plus",
  minus: "minus",
  check: "check",
  x: "close",
  "chevron-down": "chevrondown",
  "chevron-up": "chevronup",
  "chevron-right": "chevronright",
  "chevron-left": "chevronleft",
  "sidebar-on": "sidebar",
  "sidebar-off": "sidebar",
  play: "play",
  capture: "capture",
  ellipsis: "more",
  lock: "lock",
  code: "browser",
  globe: "browser",
  terminal: "terminal",
  branch: "branch",
  database: "database",
  "folder-open": "folder",
  archive: "archive",
  appearance: "sun",
  keyboard: "keyboard",
  wifi: "wifi",
  alert: "alert",
  "check-circle": "checkcircle",
  circle: "circle",
};
const symbols = Object.entries(iconMap)
  .map(
    ([legacy, key]) =>
      `<symbol id="ic-${legacy}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[key].map((d) => `<path d="${d}"/>`).join("")}</g></symbol>`,
  )
  .join("\n");
await writeFile(
  resolve(root, "apps/desktop/src/assets/icons/rabta-icons.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg"><defs>\n${symbols}\n</defs></svg>\n`,
);
const brandSource = await readFile(resolve(upstream, "src/brand.ts"), "utf8");
const brand = JSON.parse(
  brandSource.slice(brandSource.indexOf("{"), brandSource.lastIndexOf("}") + 1),
);
const { hsl } = await import(resolve(studio, "scripts/build-brand.mjs"));
const tokenMap = {
  background: "canvas",
  foreground: "ink",
  card: "surface",
  "card-foreground": "ink",
  popover: "surface",
  "popover-foreground": "ink",
  secondary: "hover",
  "secondary-foreground": "ink",
  muted: "deep",
  "muted-foreground": "muted",
  "tertiary-foreground": "tertiary",
  accent: "hover",
  "accent-foreground": "ink",
  border: "border",
  input: "border",
  sidebar: "deep",
  "sidebar-foreground": "ink",
  "sidebar-accent": "hover",
  "sidebar-accent-foreground": "ink",
  "sidebar-border": "border",
  field: "surface",
  primary: "signal",
  "primary-hover": "signal",
  "accent-text": "signal",
  ring: "signal",
  "sidebar-primary": "signal",
  "sidebar-ring": "signal",
};
const cssPath = resolve(root, "apps/desktop/src/index.css");
let css = await readFile(cssPath, "utf8");
for (const mode of ["light", "dark"]) {
  const selector = mode === "light" ? ":root" : ".dark";
  const start = css.indexOf(selector + " {");
  const end = css.indexOf("\n  }", start);
  let block = css.slice(start, end);
  for (const [token, role] of Object.entries(tokenMap)) {
    block = block.replace(
      new RegExp(`(--${token}:) [^;]+;[^\n]*`),
      `$1 ${hsl(brand[mode][role])};`,
    );
  }
  for (const token of ["primary-foreground", "sidebar-primary-foreground"]) {
    block = block.replace(
      new RegExp(`(--${token}:) [^;]+;[^\n]*`),
      `$1 ${hsl(mode === "light" ? brand.light.surface : brand.dark.canvas)};`,
    );
  }
  css = css.slice(0, start) + block + css.slice(end);
}
await writeFile(cssPath, css);
