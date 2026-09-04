import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The newest database schema (PRAGMA user_version) this build was written
 * against. A newer database still opens; the CLI prints one warning so the
 * user knows that fields added later are not surfaced.
 */
export const KNOWN_SCHEMA = 5;

/** Where the release Rabta app keeps its database, relative to the home directory. */
export const RELEASE_DB_SEGMENTS: readonly string[] = [
  "Library",
  "Application Support",
  "com.omnibus.dev",
  "omnibus.db",
];

/** Where a debug build of the app keeps its database (selected with --debug). */
export const DEBUG_DB_SEGMENTS: readonly string[] = [
  "Library",
  "Application Support",
  "com.omnibus.dev.debug",
  "omnibus.db",
];

export interface PathOptions {
  /** Environment to consult for RABTA_DB. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Command line arguments after the script name. Defaults to process.argv.slice(2). */
  argv?: readonly string[];
  /** Home directory. Defaults to os.homedir(). */
  home?: string;
}

/**
 * Resolves the database file to open: RABTA_DB when set, otherwise the debug
 * app's database when --debug is passed, otherwise the release app's.
 */
export function resolveDbPath(options: PathOptions = {}): string {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  const override = env.RABTA_DB?.trim();
  if (override) return override;
  const home = options.home ?? homedir();
  const segments = argv.includes("--debug") ? DEBUG_DB_SEGMENTS : RELEASE_DB_SEGMENTS;
  return join(home, ...segments);
}
