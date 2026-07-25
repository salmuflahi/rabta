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
    rollupOptions: {
      output: {
        // Split large dependencies out of the app bundle so no single chunk
        // trips Vite's 500 kB advisory and browsers can cache vendor code
        // across app-code changes.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler"))
            return "react";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@dnd-kit")) return "dnd-kit";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
