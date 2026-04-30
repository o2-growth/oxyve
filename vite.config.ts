import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
    mode === "development" && componentTagger(),
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
        // SW só em prod build — evita interferência no HMR do Lovable.
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
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
        runtimeCaching: [
          // Supabase REST (PostgREST) — network-first com fallback de 5min.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/rest/v1/") ||
              /\.supabase\.co\/rest\/v1\//.test(url.href),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-rest",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase Edge Functions.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/functions/v1/") ||
              /\.supabase\.co\/functions\/v1\//.test(url.href),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-functions",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Imagens (recibos, avatares, storage Supabase) — cache-first.
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Fonts.
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
