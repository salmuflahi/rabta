import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd against a local D1, with the real wrangler.jsonc
// (bindings, cron, vars) plus two things production never has: the migration
// files, handed to test/setup.ts so it can apply them, and a known STATS_TOKEN
// standing in for the deployed secret.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(import.meta.dirname, "wrangler.jsonc") },
      miniflare: {
        // The pool pins its own miniflare, and that build's workerd lags the one
        // wrangler deploys with: it refuses the compatibility_date in
        // wrangler.jsonc. Nothing this worker uses changed between the two
        // dates, so tests run on the newest date the test runtime accepts.
        // Drop this line once @cloudflare/vitest-pool-workers catches up.
        compatibilityDate: "2026-08-22",
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          STATS_TOKEN: "test-token-0123456789abcdef",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    // Both spec files write to the same D1 and clean it between tests; running
    // them one after the other keeps that cleanup meaningful.
    fileParallelism: false,
  },
});
