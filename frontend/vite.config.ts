/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In development the browser talks only to Vite; /api (and uploaded /media photos)
  // are forwarded to Django. Same origin means the httpOnly refresh cookie works with no CORS setup.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/media': { target: apiTarget, changeOrigin: false },
      },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget }, '/media': { target: apiTarget } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/api/schema.d.ts', 'src/test/**', 'src/main.tsx', '**/*.test.*'],
      },
    },
  }
})
