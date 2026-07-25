/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    // A larger single bundle (Vite's 500 kB advisory is cosmetic) is safer
    // than manual vendor chunks: splitting React and Radix into separate
    // chunks made the Radix chunk run `React.forwardRef` before React was
    // initialized, crashing the production build with a blank screen. Let
    // Vite/Rollup decide chunking so the React init order stays correct.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
