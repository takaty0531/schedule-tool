import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages デプロイ設定
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/schedule-tool/',
})
