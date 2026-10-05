import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'theme-init.js'],
      manifest: {
        name: 'QR Studio',
        short_name: 'QR',
        description: 'QRコード・バーコード・2次元コード（Data Matrix・PDF417・Aztec）を端末内だけで生成・読取するPWA',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#2657d9',
        background_color: '#f6f7f9',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press / right-click menu of the installed app. URLs carry only the screen to open.
        shortcuts: [
          { name: 'QRコードを作る', short_name: 'QRコード', url: '/?mode=qr&tab=generate', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'バーコードを作る', short_name: 'バーコード', url: '/?mode=barcode&tab=generate', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: '2次元コードを作る', short_name: '2次元コード', url: '/?mode=datamatrix&tab=generate', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'コードを読み取る', short_name: '読み取る', url: '/?tab=scan', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // Images shared from other apps (Android) open the scan tab; see public/share-target-sw.js.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'image', accept: ['image/*'] }] },
        },
      },
      workbox: {
        importScripts: ['share-target-sw.js'],
        // Precache everything including the zxing wasm (~1 MB) and fonts so the app works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
