import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/assets/sky_healthcare/frontend/'
// the running site; `npm run dev` proxies API calls to it
const SITE = process.env.SITE_URL || 'http://localhost:8088'

export default defineConfig({
  plugins: [
    frappeui({
      frontendRoute: '/pharmacy',
      frappeProxy: false,
      jinjaBootData: false,
      buildConfig: {
        outDir: '../sky_healthcare/public/frontend',
        indexHtmlPath: '../sky_healthcare/www/pharmacy.html',
        baseUrl: BASE,
      },
    }),
    vue(),
    VitePWA({
      // registered by hand from /pharmacy/sw.js, see src/pwa.js and sky_healthcare/service_worker.py
      injectRegister: null,
      registerType: 'autoUpdate',
      filename: 'sw.js',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-mark.svg'],
      manifest: {
        id: '/pharmacy/',
        name: 'Pharmastock',
        short_name: 'Pharmastock',
        description: 'Medicine stock for health centers',
        start_url: '/pharmacy/',
        scope: '/pharmacy/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f5f1',
        theme_color: '#235a49',
        icons: [
          { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,svg,png,woff2,html}'],
        // precache entries are relative; make them absolute so they resolve from /pharmacy/sw.js
        modifyURLPrefix: { '': BASE },
        navigateFallback: `${BASE}index.html`,
        navigateFallbackAllowlist: [/^\/pharmacy(\/|$)/],
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 8090,
    proxy: { '^/(api|assets|files|private|login)': { target: SITE, changeOrigin: false } },
  },
})
