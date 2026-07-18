import { defineConfig } from "vitest/config";

// Long timeouts: the integration test compiles and spawns the Rust headless hub.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 240_000 },
});
