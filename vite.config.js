import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), wgslVitePlugin({ minify: mode === "production" })],
  server: { port: 5173 },
  build: { target: "esnext" },
}));
