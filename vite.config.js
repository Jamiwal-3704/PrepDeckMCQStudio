import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// HTTP dev server (no @vitejs/plugin-basic-ssl): HTTPS + Node 22 can throw
// "server.shouldUpgradeCallback is not a function" and crash the dev process.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    open: true,
  },
  build: {
    sourcemap: false,
    target: "es2018",
    chunkSizeWarningLimit: 600,
  },
});
