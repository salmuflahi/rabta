/**
 * Vite config for the screenshot capture rig.
 *
 * Identical to the app's own config except that the two Tauri modules are
 * aliased to the mock bridge. Kept separate from `apps/desktop/vite.config.ts`
 * so the shipped build can never pick the mocks up.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const src = fileURLToPath(new URL("../src", import.meta.url));
const mock = fileURLToPath(new URL("./mock-tauri.ts", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  clearScreen: false,
  // HMR off: its WebSocket never closes, so Chrome's --virtual-time-budget
  // would wait on it forever and the capture would hang instead of settling.
  server: { port: 5199, strictPort: true, hmr: false },
  // Pinned explicitly: moving `root` into capture/ would otherwise leave
  // PostCSS/Tailwind resolution dependent on where the command was run from,
  // which is exactly the kind of ambient state a capture rig must not have.
  css: { postcss: appDir },
  resolve: {
    alias: {
      "@": src,
      "@tauri-apps/api/core": mock,
      "@tauri-apps/api/event": mock,
    },
  },
});
