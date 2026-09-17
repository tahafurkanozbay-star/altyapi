import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 2500
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
