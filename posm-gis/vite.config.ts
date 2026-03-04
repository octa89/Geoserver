import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy GeoServer requests through the dev server to avoid CORS
      '/api/geoserver': {
        target: 'http://18.225.234.98:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geoserver/, '/geoserver'),
      },
      // Proxy config/share API to the Python server during dev (if running)
      '/api/config': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/share': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
