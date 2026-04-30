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
        // Bundle splitting manual.
        // ⚠️ AVISO PRA QUEM ALTERAR: NÃO separe Radix/cmdk/vaul/etc. de
        // React em chunks diferentes. Esses libs usam React.forwardRef em
        // tempo de avaliação do módulo. Se vendor-radix carregar antes de
        // vendor-react, vira "Cannot read properties of undefined (reading
        // 'forwardRef')" e o app quebra em produção. Hotfix Sprint 3.1.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          // Charts (recharts + d3) — pesado mas safe pra split:
          // só carrega quando rota Dashboard/Reports monta, depois de React init.
          if (id.includes("/recharts/") || id.includes("/d3-")) {
            return "vendor-charts";
          }

          // Supabase é independente de React em init time — split safe.
          if (id.includes("/@supabase/")) {
            return "vendor-supabase";
          }

          // React + tudo que toca React.forwardRef em init (Radix, cmdk, vaul,
          // hook-form, react-router, lucide, tanstack, etc.) DEVE viver no
          // mesmo chunk pra evitar race de init.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/") ||
            id.includes("/@radix-ui/") ||
            id.includes("/cmdk/") ||
            id.includes("/vaul/") ||
            id.includes("/embla-carousel") ||
            id.includes("/react-day-picker/") ||
            id.includes("/input-otp/") ||
            id.includes("/react-resizable-panels/") ||
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/") ||
            id.includes("/lucide-react/") ||
            id.includes("/sonner/") ||
            id.includes("/@tanstack/react-query") ||
            id.includes("/class-variance-authority/")
          ) {
            return "vendor-react";
          }

          // Utils puros (sem React).
          if (
            id.includes("/date-fns/") ||
            id.includes("/zod/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/tailwindcss-animate/")
          ) {
            return "vendor-utils";
          }

          return undefined;
        },
      },
    },
  },
}));
