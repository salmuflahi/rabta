// The one binding that exists only under vitest: the parsed migration files,
// injected by vitest.config.ts so setup.ts can apply them to the local D1.
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
