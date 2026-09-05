/**
 * The site's few facts, in one place.
 *
 * Everything a page states about the build or about where a request goes
 * comes from here, so a change is one edit and the tests can import the same
 * values instead of pinning strings twice.
 */
export const SITE_ORIGIN = "https://rabta.build";

/** Flipped to true only after `npm view @rabta/mcp version` resolves. */
export const MCP_PUBLISHED = false;

export const RELEASE = {
  version: "0.1.0",
  dmgUrl: "https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg",
  dmgSizeLabel: "5.5 MB",
  dmgBytes: 5495778,
  sha256: "3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655",
  macOsFloor: "macOS 11+",
  licence: "MIT",
  publishedOn: "2026-07-29",
} as const;
