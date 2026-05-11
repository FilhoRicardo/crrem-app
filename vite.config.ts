import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Plotly + xlsx push the main bundle ~5 MB. Bump the precache cap so the
        // service worker still caches the app shell for offline use.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      manifest: {
        name: 'CRREM Admin',
        short_name: 'CRREM',
        description: 'Carbon Risk Real Estate Monitor — assessment & retrofit planning tool',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('plotly.js-dist-min')) return 'plotly'
          if (id.includes('react-dom') || id.endsWith('/react/index.js') || /node_modules\/react\//.test(id)) return 'react'
          // Split the big CRREM v2.05 dataset into its own chunk so it caches
          // independently of the app code (only invalidates when CRREM data
          // is re-parsed, not on every code push).
          if (id.endsWith('crrem-data.json')) return 'crrem-data'
          return undefined
        },
      },
    },
  },
})
