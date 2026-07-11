import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: isSsrBuild ? {} : {
        // Leaflet lives in its own chunk so funnel pages never pay for the
        // map. lucide is split because it is a large icon set.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          map: ['leaflet', 'react-leaflet'],
          lucide: ['lucide-react'],
        },
      },
    },
  },
}))
