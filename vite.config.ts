import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'robots.txt',
        'favicon.svg',
        'assets/honeytrap_logo_64.png',
        'assets/honeytrap_logo_192.png',
        'assets/honeytrap_logo_256.png',
        'assets/honeytrap_logo_512.png'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: '/index.html'
      },
      manifest: {
        name: 'Honeytrap',
        short_name: 'Honeytrap',
        description: 'Nostr PWA with thread + author views and optional WebTorrent assist.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/assets/honeytrap_logo_192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/assets/honeytrap_logo_512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
