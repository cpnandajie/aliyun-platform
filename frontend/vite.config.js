import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    allowedHosts: ['it.idongwo.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const xfwd = req.headers['x-forwarded-for']
            if (xfwd) {
              proxyReq.setHeader('X-Forwarded-For', xfwd)
            } else {
              proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress)
            }
          })
        }
      }
    }
  }
})
