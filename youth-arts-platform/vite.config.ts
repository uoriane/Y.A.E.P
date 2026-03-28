import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this repo at /Y.A.E.P/ in production.
  base: command === 'build' ? '/Y.A.E.P/' : '/',
}))
