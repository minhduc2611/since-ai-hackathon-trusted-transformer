import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.API_PORT || "8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@shared": path.resolve(import.meta.dirname, "../src/shared") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${API_PORT}`, xfwd: true },
      "/gate": { target: "http://127.0.0.1:8790", rewrite: (p) => p.replace(/^\/gate/, "") },
    },
    fs: { allow: [".."] },
  },
});
