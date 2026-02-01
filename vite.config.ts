import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  server: {
    allowedHosts: true
  },
  preview: {
    allowedHosts: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'robots.txt',
        'favicon.svg',
        'offline.html'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'honeytrap-pages',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'honeytrap-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 6
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'video',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'honeytrap-media',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 6
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'honeytrap-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
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
