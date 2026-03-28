import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: '/pwa-airsampler/',
  build: {
    sourcemap: true,
    assetsDir: 'code',
    target: ['esnext'],
    cssMinify: true,
  },
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // manifest.json in /public is used as-is
      workbox: {
        globPatterns: ['**/*.{html,js,css,json,png,jpg,jpeg,svg,ico,woff2,woff,ttf}'],
        navigateFallback: '/pwa-airsampler/index.html',
        runtimeCaching: [],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
