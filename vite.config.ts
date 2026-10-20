import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { runtimeCaching } from "./src/pwa/runtimeCaching";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Sprint 4 — PWA Foundation (DEC-009).
    // Mantemos `manifest: false` porque o `public/manifest.json` é controlado
    // manualmente (shortcuts, display_override, lang, id). O plugin gera só o SW.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
      ],
      devOptions: {
        // SW só em prod build — evita interferência no HMR do dev server.
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        // Sprint 7 — handlers de push/notificationclick injetados via
        // importScripts. Mantemos generateSW (default) em vez de migrar
        // pra injectManifest pra não quebrar o runtime caching do Sprint 4.
        // O arquivo `public/push-handler.js` é servido como /push-handler.js.
        importScripts: ["/push-handler.js"],
        // SPA: rotas /app/* devem cair no index.html.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          // Não interceptar chamadas Supabase com fallback de HTML.
          /^\/rest\//,
          /^\/functions\//,
          /^\/auth\/v1\//,
          /^\/storage\/v1\//,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Não pular waiting automaticamente — UpdatePrompt controla o reload.
        skipWaiting: false,
        // Regras em src/pwa/runtimeCaching.ts (testadas no Vitest). Nada de
        // Supabase (REST, functions, storage) entra no cache do SW.
        runtimeCaching,
      },
    }),
  ].filter(Boolean),
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
