// rabta.build: static Astro output for GitHub Pages behind a strict CSP.
//
// The policy is delivered as a meta tag because Pages cannot set headers.
// Astro writes `script-src` and `style-src` itself ('self' plus the hashes of
// whatever it inlines), so those two directives are never listed here. Adding
// 'unsafe-inline' anywhere would switch that hashing off; never do.
import { defineConfig } from "astro/config";
import { COUNT_ORIGIN } from "./src/config.ts";

export default defineConfig({
  site: "https://rabta.build",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // Every stylesheet is a <link>. An inlined <style> would need a hash and
    // would differ per page, and the tests read the built CSS as files.
    inlineStylesheets: "never",
  },
  compressHTML: true,
  devToolbar: { enabled: false },
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self'",
        `connect-src 'self' ${COUNT_ORIGIN}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "upgrade-insecure-requests",
      ],
    },
  },
});
