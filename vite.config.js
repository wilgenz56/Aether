import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/get-name': {
        target: 'http://127.0.0.1:8080', // <-- Il trucco è qui!
        changeOrigin: true,
        secure: false // <-- E qui!
      },
      '/ws': {
        target: 'http://127.0.0.1:8080', // <-- Il trucco è qui!
        ws: true,
        changeOrigin: true,
        secure: false // <-- E qui!
      }
    }
  }
})