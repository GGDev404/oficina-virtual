import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo (`npm run dev`) la página corre en :5173 y /api va al servidor de la oficina en :4777. El servidor
// exige Host y Origin propios: el proxy los reescribe. Solo existe en desarrollo; el build lo sirve el propio servidor.
const OFICINA = `http://127.0.0.1:${process.env.OFICINA_PUERTO ?? 4777}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    proxy: {
      '/api': {
        target: OFICINA,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (req) => { if (req.getHeader('origin')) req.setHeader('origin', OFICINA) }),
      },
    },
  },
})
