import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registro feito por `virtual:pwa-register` em main.tsx.
      injectRegister: false,
      // Os ícones já entram pelo globPatterns; evita entradas duplicadas no precache.
      includeManifestIcons: false,
      manifest: {
        name: 'Pluton',
        short_name: 'Pluton',
        description: 'Finanças pessoais: despesas, ganhos, parcelas e séries.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#191919',
        background_color: '#191919',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache só do app shell (JS/CSS/HTML/ícones).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        // A API nunca passa pelo service worker: sem fallback de navegação
        // e sem runtimeCaching para /api (offline = dados do cache do TanStack Query).
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Node ≥ 25 expõe um `localStorage` global próprio (inutilizável sem
    // --localstorage-file) que encobre o do jsdom; desliga para usar o do jsdom.
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
  },
});
