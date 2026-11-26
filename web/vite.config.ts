import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const reviewOrigin = env.VITE_REVIEW_API_ORIGIN
  if (reviewOrigin) {
    const url = new URL(reviewOrigin)
    if (url.origin !== reviewOrigin || url.protocol !== 'https:') {
      throw new Error('VITE_REVIEW_API_ORIGIN debe ser un origen HTTPS sin ruta ni barra final')
    }
  }
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': env.VITE_API_TARGET || 'http://127.0.0.1:18080',
      },
    },
  }
})
