import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Aria-3: chunk inicial < 600KB gzip — alvo Sprint 1.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Bundle splitting manual por categoria.
        // O id chega como caminho absoluto dentro de node_modules; testes
        // estritos via includes() evitam falso positivo (ex.: "react" matching
        // qualquer pacote @react-*).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          // Charts é volumoso e usado só no Reports/Dashboard.
          if (id.includes("/recharts/") || id.includes("/d3-")) {
            return "vendor-charts";
          }

          if (
            id.includes("/@radix-ui/") ||
            id.includes("/cmdk/") ||
            id.includes("/vaul/") ||
            id.includes("/embla-carousel") ||
            id.includes("/react-day-picker/") ||
            id.includes("/input-otp/") ||
            id.includes("/react-resizable-panels/")
          ) {
            return "vendor-radix";
          }

          if (id.includes("/@tanstack/react-query")) {
            return "vendor-query";
          }

          if (id.includes("/@supabase/")) {
            return "vendor-supabase";
          }

          if (
            id.includes("/react-router") ||
            id.includes("/react-dom/") ||
            id.includes("/react/")
          ) {
            return "vendor-react";
          }

          if (
            id.includes("/date-fns/") ||
            id.includes("/zod/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/sonner/") ||
            id.includes("/class-variance-authority/") ||
            id.includes("/lucide-react/") ||
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/")
          ) {
            return "vendor-utils";
          }

          return undefined;
        },
      },
    },
  },
}));
