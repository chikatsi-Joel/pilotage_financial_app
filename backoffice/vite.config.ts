import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Compilé dans ../static/admin, servi par FastAPI sous /admin.
// En dev (npm run dev), les appels /admin/api sont relayés vers l'API locale.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "../static/admin",
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], charts: ["recharts"] } } },
  },
  server: { proxy: { "/admin/api": "http://localhost:8000" } },
});
