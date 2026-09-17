import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 4173
  },
  preview: {
    host: "0.0.0.0",
    port: 4173
  },
  build: {
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
        }
      }
    }
  }
});
