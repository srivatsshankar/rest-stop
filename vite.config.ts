import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    watch: {
      ignored: ["**/.dev-data/**"]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
