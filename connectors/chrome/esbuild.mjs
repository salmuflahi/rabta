// Bundles the extension's two entry points; @omnibus/protocol is inlined.
import { build } from "esbuild";

for (const entry of ["background", "popup"]) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    format: "esm",
    target: "chrome116",
    sourcemap: true,
  });
}
