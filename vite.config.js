import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    https: true,
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
  }
})
