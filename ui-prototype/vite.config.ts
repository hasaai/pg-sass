import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the built prototype opens from any folder or link (it uses # routes).
export default defineConfig({ base: './', plugins: [react(), tailwindcss()] })
