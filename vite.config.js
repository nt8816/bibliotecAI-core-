import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

process.env.BROWSERSLIST_IGNORE_OLD_DATA = process.env.BROWSERSLIST_IGNORE_OLD_DATA || "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  base: "/",
  build: {
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("jspdf") || id.includes("html2canvas")) return "vendor-pdf";
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("react-router")) return "vendor-router";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
